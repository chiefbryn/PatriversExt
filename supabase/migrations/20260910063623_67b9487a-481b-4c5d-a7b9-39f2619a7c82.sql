CREATE TABLE public.stock_counts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  count_number text NOT NULL,
  outlet_id uuid NOT NULL REFERENCES public.outlets(id),
  scope text NOT NULL DEFAULT 'full',
  status text NOT NULL DEFAULT 'draft',
  notes text,
  counted_by uuid NOT NULL,
  counted_by_name text,
  submitted_at timestamp with time zone,
  approved_by uuid,
  approved_at timestamp with time zone,
  rejected_by uuid,
  rejected_at timestamp with time zone,
  rejection_reason text,
  item_count integer NOT NULL DEFAULT 0,
  variance_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_count_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name text NOT NULL,
  system_qty integer NOT NULL DEFAULT 0,
  counted_qty integer,
  variance integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (count_id, product_id)
);

CREATE INDEX idx_stock_counts_outlet ON public.stock_counts(outlet_id, created_at DESC);
CREATE INDEX idx_stock_count_items_count ON public.stock_count_items(count_id);

GRANT SELECT ON public.stock_counts TO authenticated;
GRANT SELECT, UPDATE ON public.stock_count_items TO authenticated;
GRANT ALL ON public.stock_counts TO service_role;
GRANT ALL ON public.stock_count_items TO service_role;

ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and CEO can view stock counts"
ON public.stock_counts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'));

CREATE POLICY "Admin and CEO can view stock count items"
ON public.stock_count_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'));

CREATE POLICY "Admin and CEO can edit draft count items"
ON public.stock_count_items FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'))
  AND EXISTS (SELECT 1 FROM public.stock_counts c WHERE c.id = count_id AND c.status = 'draft')
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'))
  AND EXISTS (SELECT 1 FROM public.stock_counts c WHERE c.id = count_id AND c.status = 'draft')
);

CREATE TRIGGER update_stock_counts_updated_at BEFORE UPDATE ON public.stock_counts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stock_count_items_updated_at BEFORE UPDATE ON public.stock_count_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Creates a count sheet snapshotting current system quantities for the branch
CREATE OR REPLACE FUNCTION public.create_stock_count(
  p_outlet_id uuid,
  p_scope text DEFAULT 'full',
  p_product_ids uuid[] DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
  v_number text;
  v_items integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (has_role(v_uid, 'admin') OR has_role(v_uid, 'ceo')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF p_scope NOT IN ('full', 'partial') THEN RAISE EXCEPTION 'Invalid scope'; END IF;
  IF p_scope = 'partial' AND (p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL) THEN
    RAISE EXCEPTION 'Select at least one product';
  END IF;

  SELECT full_name INTO v_name FROM profiles WHERE user_id = v_uid;
  v_number := 'SC-' || to_char(now(), 'YYMMDD') || '-' || lpad((floor(random() * 10000))::text, 4, '0');

  INSERT INTO stock_counts (count_number, outlet_id, scope, notes, counted_by, counted_by_name)
  VALUES (v_number, p_outlet_id, p_scope, p_notes, v_uid, v_name)
  RETURNING id INTO v_id;

  INSERT INTO stock_count_items (count_id, product_id, product_name, system_qty)
  SELECT v_id, p.id, p.name, COALESCE(os.quantity, 0)
  FROM products p
  LEFT JOIN outlet_stock os ON os.product_id = p.id AND os.outlet_id = p_outlet_id
  WHERE p.status <> 'deleted'
    AND (p_scope = 'full' OR p.id = ANY(p_product_ids));

  SELECT count(*) INTO v_items FROM stock_count_items WHERE count_id = v_id;
  UPDATE stock_counts SET item_count = v_items WHERE id = v_id;

  RETURN jsonb_build_object('id', v_id, 'count_number', v_number, 'item_count', v_items);
END; $$;

-- Locks the sheet for approval
CREATE OR REPLACE FUNCTION public.submit_stock_count(p_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_variance integer;
BEGIN
  IF NOT (has_role(v_uid, 'admin') OR has_role(v_uid, 'ceo')) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT status INTO v_status FROM stock_counts WHERE id = p_count_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Count not found'; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Only a draft count can be submitted'; END IF;

  UPDATE stock_count_items
  SET variance = COALESCE(counted_qty, system_qty) - system_qty
  WHERE count_id = p_count_id;

  SELECT count(*) INTO v_variance FROM stock_count_items WHERE count_id = p_count_id AND variance <> 0;

  UPDATE stock_counts
  SET status = 'submitted', submitted_at = now(), variance_count = v_variance
  WHERE id = p_count_id;

  RETURN jsonb_build_object('status', 'submitted', 'variance_count', v_variance);
END; $$;

-- Approve applies the counted quantities; reject or cancel changes no stock
CREATE OR REPLACE FUNCTION public.respond_stock_count(
  p_count_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_outlet uuid;
  v_item record;
  v_applied integer := 0;
BEGIN
  IF NOT (has_role(v_uid, 'admin') OR has_role(v_uid, 'ceo')) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_action NOT IN ('approve', 'reject', 'cancel') THEN RAISE EXCEPTION 'Invalid action'; END IF;

  SELECT status, outlet_id INTO v_status, v_outlet FROM stock_counts WHERE id = p_count_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Count not found'; END IF;

  IF p_action = 'cancel' THEN
    IF v_status NOT IN ('draft', 'submitted') THEN RAISE EXCEPTION 'Count can no longer be cancelled'; END IF;
    UPDATE stock_counts SET status = 'cancelled' WHERE id = p_count_id;
    RETURN jsonb_build_object('status', 'cancelled', 'adjusted', 0);
  END IF;

  IF v_status <> 'submitted' THEN RAISE EXCEPTION 'Only a submitted count can be approved or rejected'; END IF;

  IF p_action = 'reject' THEN
    UPDATE stock_counts
    SET status = 'rejected', rejected_by = v_uid, rejected_at = now(), rejection_reason = p_reason
    WHERE id = p_count_id;
    RETURN jsonb_build_object('status', 'rejected', 'adjusted', 0);
  END IF;

  PERFORM set_config('app.skip_product_movement', '1', true);

  FOR v_item IN
    SELECT i.product_id, i.counted_qty, i.system_qty, i.variance
    FROM stock_count_items i
    WHERE i.count_id = p_count_id AND i.counted_qty IS NOT NULL AND i.variance <> 0
  LOOP
    INSERT INTO stock_movements (
      product_id, movement_type, quantity, quantity_before, quantity_after,
      reason, reference, user_id, outlet_id
    ) VALUES (
      v_item.product_id,
      CASE WHEN v_item.variance > 0 THEN 'in' ELSE 'out' END,
      abs(v_item.variance), v_item.system_qty, v_item.counted_qty,
      'Shelf count adjustment', 'STOCK-COUNT', v_uid, v_outlet
    );

    UPDATE products SET qty = GREATEST(qty + v_item.variance, 0) WHERE id = v_item.product_id;
    v_applied := v_applied + 1;
  END LOOP;

  PERFORM set_config('app.skip_product_movement', '0', true);

  UPDATE stock_counts
  SET status = 'approved', approved_by = v_uid, approved_at = now()
  WHERE id = p_count_id;

  RETURN jsonb_build_object('status', 'approved', 'adjusted', v_applied);
END; $$;

REVOKE ALL ON FUNCTION public.create_stock_count(uuid, text, uuid[], text) FROM anon, public;
REVOKE ALL ON FUNCTION public.submit_stock_count(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.respond_stock_count(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_stock_count(uuid, text, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_stock_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_stock_count(uuid, text, text) TO authenticated;