CREATE TABLE public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL UNIQUE DEFAULT ('TRF-' || to_char(now(),'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6))),
  from_outlet_id uuid NOT NULL REFERENCES public.outlets(id),
  to_outlet_id uuid NOT NULL REFERENCES public.outlets(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','completed','rejected','cancelled')),
  requested_by uuid NOT NULL,
  requested_by_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  received_by uuid,
  received_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_outlet_id <> to_outlet_id)
);
CREATE INDEX idx_stock_transfers_status ON public.stock_transfers(status);
CREATE INDEX idx_stock_transfers_from ON public.stock_transfers(from_outlet_id);
CREATE INDEX idx_stock_transfers_to ON public.stock_transfers(to_outlet_id);

GRANT SELECT ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfers TO service_role;

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view transfers" ON public.stock_transfers FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_stock_transfers_updated_at BEFORE UPDATE ON public.stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.request_stock_transfer(
  p_product_id uuid, p_from_outlet_id uuid, p_to_outlet_id uuid, p_quantity integer, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role app_role;
  v_my_outlet uuid;
  v_name text;
  v_id uuid;
  v_pname text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF p_from_outlet_id = p_to_outlet_id THEN RAISE EXCEPTION 'Sending and receiving branches must differ'; END IF;
  v_role := public.get_user_role(v_uid);
  v_my_outlet := public.get_user_outlet(v_uid);
  IF v_role NOT IN ('admin','ceo') AND (v_my_outlet IS NULL OR v_my_outlet <> p_to_outlet_id) THEN
    RAISE EXCEPTION 'You can only request stock for your own branch';
  END IF;
  SELECT name INTO v_pname FROM public.products WHERE id = p_product_id;
  IF v_pname IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  INSERT INTO public.stock_transfers (from_outlet_id, to_outlet_id, product_id, product_name, quantity, requested_by, requested_by_name, notes)
  VALUES (p_from_outlet_id, p_to_outlet_id, p_product_id, v_pname, p_quantity, v_uid, v_name, p_notes)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'status', 'requested');
END; $$;

CREATE OR REPLACE FUNCTION public.respond_stock_transfer(p_transfer_id uuid, p_action text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role app_role;
  v_my_outlet uuid;
  t public.stock_transfers%ROWTYPE;
  v_is_source boolean;
  v_is_dest boolean;
  v_from_qty integer;
  v_to_qty integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO t FROM public.stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  v_role := public.get_user_role(v_uid);
  v_my_outlet := public.get_user_outlet(v_uid);
  v_is_source := v_role IN ('admin','ceo') OR v_my_outlet = t.from_outlet_id;
  v_is_dest := v_role IN ('admin','ceo') OR v_my_outlet = t.to_outlet_id;

  IF p_action = 'approve' THEN
    IF t.status <> 'requested' THEN RAISE EXCEPTION 'Only a pending request can be approved'; END IF;
    IF NOT v_is_source THEN RAISE EXCEPTION 'Only the sending branch can approve'; END IF;
    SELECT quantity INTO v_from_qty FROM public.outlet_stock WHERE outlet_id = t.from_outlet_id AND product_id = t.product_id;
    IF COALESCE(v_from_qty,0) < t.quantity THEN
      RAISE EXCEPTION 'Sending branch only has % in stock', COALESCE(v_from_qty,0);
    END IF;
    UPDATE public.stock_transfers SET status='approved', approved_by=v_uid, approved_at=now() WHERE id = t.id;

  ELSIF p_action = 'reject' THEN
    IF t.status NOT IN ('requested','approved') THEN RAISE EXCEPTION 'This transfer is already closed'; END IF;
    IF NOT (v_is_source OR v_is_dest) THEN RAISE EXCEPTION 'Not permitted'; END IF;
    UPDATE public.stock_transfers SET status='rejected', rejected_by=v_uid, rejected_at=now(), rejection_reason=p_reason WHERE id = t.id;

  ELSIF p_action = 'cancel' THEN
    IF t.status NOT IN ('requested','approved') THEN RAISE EXCEPTION 'This transfer is already closed'; END IF;
    IF NOT v_is_dest THEN RAISE EXCEPTION 'Only the requesting branch can cancel'; END IF;
    UPDATE public.stock_transfers SET status='cancelled', rejected_by=v_uid, rejected_at=now(), rejection_reason=p_reason WHERE id = t.id;

  ELSIF p_action = 'receive' THEN
    IF t.status <> 'approved' THEN RAISE EXCEPTION 'The sending branch has not approved this transfer yet'; END IF;
    IF NOT v_is_dest THEN RAISE EXCEPTION 'Only the receiving branch can confirm receipt'; END IF;
    INSERT INTO public.outlet_stock (outlet_id, product_id, quantity) VALUES (t.from_outlet_id, t.product_id, 0) ON CONFLICT (outlet_id, product_id) DO NOTHING;
    INSERT INTO public.outlet_stock (outlet_id, product_id, quantity) VALUES (t.to_outlet_id, t.product_id, 0) ON CONFLICT (outlet_id, product_id) DO NOTHING;
    SELECT quantity INTO v_from_qty FROM public.outlet_stock WHERE outlet_id = t.from_outlet_id AND product_id = t.product_id FOR UPDATE;
    SELECT quantity INTO v_to_qty FROM public.outlet_stock WHERE outlet_id = t.to_outlet_id AND product_id = t.product_id FOR UPDATE;
    IF v_from_qty < t.quantity THEN
      RAISE EXCEPTION 'Sending branch only has % in stock; transfer cannot complete', v_from_qty;
    END IF;
    -- Two movements; the outlet_stock trigger applies each delta. Company-wide product qty is unchanged.
    INSERT INTO public.stock_movements (product_id, movement_type, quantity, quantity_before, quantity_after, reason, reference, user_id, outlet_id)
    VALUES (t.product_id, 'out', t.quantity, v_from_qty, v_from_qty - t.quantity, 'Transfer to branch', t.transfer_number, v_uid, t.from_outlet_id);
    INSERT INTO public.stock_movements (product_id, movement_type, quantity, quantity_before, quantity_after, reason, reference, user_id, outlet_id)
    VALUES (t.product_id, 'in', t.quantity, v_to_qty, v_to_qty + t.quantity, 'Transfer from branch', t.transfer_number, v_uid, t.to_outlet_id);
    UPDATE public.stock_transfers SET status='completed', received_by=v_uid, received_at=now() WHERE id = t.id;
  ELSE
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  RETURN jsonb_build_object('id', t.id, 'status', (SELECT status FROM public.stock_transfers WHERE id = t.id));
END; $$;

REVOKE ALL ON FUNCTION public.request_stock_transfer(uuid,uuid,uuid,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_stock_transfer(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_stock_transfer(uuid,uuid,uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_stock_transfer(uuid,text,text) TO authenticated;