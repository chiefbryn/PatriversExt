-- ===== OUTLETS =====
CREATE TABLE public.outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  address text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlets TO authenticated;
GRANT ALL ON public.outlets TO service_role;
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view outlets" ON public.outlets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage outlets" ON public.outlets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_outlets_updated_at BEFORE UPDATE ON public.outlets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== OUTLET COLUMNS + CLIENT IDS =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES public.outlets(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES public.outlets(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_id uuid UNIQUE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES public.outlets(id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS client_id uuid UNIQUE;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES public.outlets(id);
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS client_id uuid UNIQUE;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES public.outlets(id);
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS client_id uuid UNIQUE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES public.outlets(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS client_id uuid UNIQUE;
CREATE INDEX IF NOT EXISTS idx_sales_outlet ON public.sales(outlet_id);
CREATE INDEX IF NOT EXISTS idx_documents_outlet ON public.documents(outlet_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_outlet ON public.stock_movements(outlet_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_outlet ON public.requisitions(outlet_id);

-- ===== OUTLET STOCK =====
CREATE TABLE public.outlet_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlet_stock TO authenticated;
GRANT ALL ON public.outlet_stock TO service_role;
ALTER TABLE public.outlet_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view outlet stock" ON public.outlet_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage outlet stock" ON public.outlet_stock FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_outlet_stock_updated_at BEFORE UPDATE ON public.outlet_stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== DEVICES =====
CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_key text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  outlet_id uuid REFERENCES public.outlets(id),
  name text,
  platform text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  offline_access_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own devices or admins/ceo all" ON public.devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'));
CREATE POLICY "Users register own devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own devices" ON public.devices FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage devices" ON public.devices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== SYNC CONFLICTS =====
CREATE TABLE public.sync_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  client_id uuid,
  outlet_id uuid REFERENCES public.outlets(id),
  device_id text,
  user_id uuid,
  reason text NOT NULL,
  details jsonb,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sync_conflicts TO authenticated;
GRANT ALL ON public.sync_conflicts TO service_role;
ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and CEO view conflicts" ON public.sync_conflicts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR auth.uid() = user_id);
CREATE POLICY "Authenticated insert conflicts" ON public.sync_conflicts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin and CEO resolve conflicts" ON public.sync_conflicts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo'));

-- ===== HELPERS =====
CREATE OR REPLACE FUNCTION public.get_user_outlet(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT outlet_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Auto-fill outlet_id from the acting user's profile
CREATE OR REPLACE FUNCTION public.set_outlet_from_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  IF NEW.outlet_id IS NULL THEN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
      BEGIN
        IF TG_TABLE_NAME = 'sales' THEN v_uid := NEW.cashier_id;
        ELSIF TG_TABLE_NAME = 'payments' THEN v_uid := NEW.received_by;
        ELSE v_uid := NEW.user_id; END IF;
      EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
    END IF;
    IF v_uid IS NOT NULL THEN
      NEW.outlet_id := public.get_user_outlet(v_uid);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_sales_set_outlet BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_outlet_from_profile();
CREATE TRIGGER trg_documents_set_outlet BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_outlet_from_profile();
CREATE TRIGGER trg_stock_movements_set_outlet BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.set_outlet_from_profile();
CREATE TRIGGER trg_requisitions_set_outlet BEFORE INSERT ON public.requisitions FOR EACH ROW EXECUTE FUNCTION public.set_outlet_from_profile();
CREATE TRIGGER trg_payments_set_outlet BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_outlet_from_profile();

-- Apply each stock movement delta to the outlet's own balance (never overwrite totals)
CREATE OR REPLACE FUNCTION public.apply_movement_to_outlet_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_delta integer;
BEGIN
  IF NEW.outlet_id IS NULL THEN RETURN NEW; END IF;
  v_delta := COALESCE(NEW.quantity_after, 0) - COALESCE(NEW.quantity_before, 0);
  IF v_delta = 0 THEN
    v_delta := CASE NEW.movement_type WHEN 'in' THEN NEW.quantity WHEN 'out' THEN -NEW.quantity ELSE 0 END;
  END IF;
  INSERT INTO public.outlet_stock (outlet_id, product_id, quantity)
  VALUES (NEW.outlet_id, NEW.product_id, v_delta)
  ON CONFLICT (outlet_id, product_id)
  DO UPDATE SET quantity = public.outlet_stock.quantity + EXCLUDED.quantity, updated_at = now();
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_apply_movement_outlet_stock AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.apply_movement_to_outlet_stock();

-- Product qty trigger: allow RPCs that write explicit movements to skip the auto-movement
CREATE OR REPLACE FUNCTION public.trg_product_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_movement_type text;
  v_qty_diff integer;
  v_user_id uuid;
BEGIN
  IF current_setting('app.skip_product_movement', true) = '1' THEN RETURN NEW; END IF;
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' AND NEW.qty > 0 THEN
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE product_id = NEW.id AND quantity_after = NEW.qty AND created_at > now() - interval '5 seconds') THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.stock_movements (product_id, movement_type, quantity, quantity_before, quantity_after, reason, reference, user_id)
    VALUES (NEW.id, 'in', NEW.qty, 0, NEW.qty, 'Initial stock - Product created', 'INV-INIT', v_user_id);
  ELSIF TG_OP = 'UPDATE' AND OLD.qty IS DISTINCT FROM NEW.qty THEN
    v_qty_diff := NEW.qty - OLD.qty;
    IF v_qty_diff > 0 THEN v_movement_type := 'in';
    ELSIF v_qty_diff < 0 THEN v_movement_type := 'out';
    ELSE RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE product_id = NEW.id AND quantity = ABS(v_qty_diff) AND quantity_before = OLD.qty AND quantity_after = NEW.qty AND created_at > now() - interval '5 seconds') THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.stock_movements (product_id, movement_type, quantity, quantity_before, quantity_after, reason, reference, user_id)
    VALUES (NEW.id, v_movement_type, ABS(v_qty_diff), OLD.qty, NEW.qty,
      CASE WHEN v_qty_diff > 0 THEN 'Stock adjustment - Inventory increase' ELSE 'Stock adjustment - Inventory decrease' END,
      'INV-ADJ', v_user_id);
  END IF;
  RETURN NEW;
END; $function$;

-- ===== ASSIGN EXISTING RECORDS TO AN OUTLET =====
CREATE OR REPLACE FUNCTION public.count_unassigned_records()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'profiles', (SELECT count(*) FROM public.profiles WHERE outlet_id IS NULL),
    'sales', (SELECT count(*) FROM public.sales WHERE outlet_id IS NULL),
    'documents', (SELECT count(*) FROM public.documents WHERE outlet_id IS NULL),
    'stock_movements', (SELECT count(*) FROM public.stock_movements WHERE outlet_id IS NULL),
    'requisitions', (SELECT count(*) FROM public.requisitions WHERE outlet_id IS NULL),
    'payments', (SELECT count(*) FROM public.payments WHERE outlet_id IS NULL),
    'products_without_outlet_stock', (SELECT count(*) FROM public.products p WHERE NOT EXISTS (SELECT 1 FROM public.outlet_stock os WHERE os.product_id = p.id))
  )
$$;

CREATE OR REPLACE FUNCTION public.assign_unassigned_to_outlet(p_outlet_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profiles int; v_sales int; v_docs int; v_moves int; v_reqs int; v_pays int; v_stock int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can assign records to an outlet';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.outlets WHERE id = p_outlet_id) THEN
    RAISE EXCEPTION 'Outlet not found';
  END IF;
  UPDATE public.profiles SET outlet_id = p_outlet_id WHERE outlet_id IS NULL; GET DIAGNOSTICS v_profiles = ROW_COUNT;
  UPDATE public.sales SET outlet_id = p_outlet_id WHERE outlet_id IS NULL; GET DIAGNOSTICS v_sales = ROW_COUNT;
  UPDATE public.documents SET outlet_id = p_outlet_id WHERE outlet_id IS NULL; GET DIAGNOSTICS v_docs = ROW_COUNT;
  UPDATE public.stock_movements SET outlet_id = p_outlet_id WHERE outlet_id IS NULL; GET DIAGNOSTICS v_moves = ROW_COUNT;
  UPDATE public.requisitions SET outlet_id = p_outlet_id WHERE outlet_id IS NULL; GET DIAGNOSTICS v_reqs = ROW_COUNT;
  UPDATE public.payments SET outlet_id = p_outlet_id WHERE outlet_id IS NULL; GET DIAGNOSTICS v_pays = ROW_COUNT;
  -- Seed outlet stock from current totals only for products with no outlet stock anywhere (never overwrite)
  INSERT INTO public.outlet_stock (outlet_id, product_id, quantity)
  SELECT p_outlet_id, p.id, p.qty FROM public.products p
  WHERE NOT EXISTS (SELECT 1 FROM public.outlet_stock os WHERE os.product_id = p.id);
  GET DIAGNOSTICS v_stock = ROW_COUNT;
  INSERT INTO public.activity_log (user_id, action, module, document_ref)
  SELECT auth.uid(), 'Assigned unassigned records to outlet', 'Outlets', p_outlet_id::text WHERE auth.uid() IS NOT NULL;
  RETURN jsonb_build_object('profiles', v_profiles, 'sales', v_sales, 'documents', v_docs,
    'stock_movements', v_moves, 'requisitions', v_reqs, 'payments', v_pays, 'outlet_stock_seeded', v_stock);
END; $$;

-- First outlet ever created inherits all existing records
CREATE OR REPLACE FUNCTION public.trg_first_outlet_assign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.outlets) = 1 THEN
    PERFORM public.assign_unassigned_to_outlet(NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_outlets_first_assign AFTER INSERT ON public.outlets FOR EACH ROW EXECUTE FUNCTION public.trg_first_outlet_assign();

-- ===== PROCESS SALE: outlet + idempotency aware =====
DROP FUNCTION IF EXISTS public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb);
CREATE OR REPLACE FUNCTION public.process_sale(
  p_cashier_id uuid,
  p_customer_name text DEFAULT 'Walk-in',
  p_payment_method text DEFAULT 'Cash',
  p_discount numeric DEFAULT 0,
  p_amount_tendered numeric DEFAULT 0,
  p_notes text DEFAULT NULL,
  p_prescription_id uuid DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_outlet_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_sale_id uuid;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_line_total numeric;
  v_invoice_number text;
  v_next_num integer;
  v_outlet_id uuid;
  v_existing record;
  v_prod record;
  v_outlet_qty integer;
  v_qty integer;
  v_flagged boolean := false;
BEGIN
  -- Idempotency: same client_id => return the already-recorded sale
  IF p_client_id IS NOT NULL THEN
    SELECT id, invoice_number, total, change_due INTO v_existing FROM public.sales WHERE client_id = p_client_id;
    IF FOUND THEN
      RETURN jsonb_build_object('sale_id', v_existing.id, 'invoice_number', v_existing.invoice_number,
        'total', v_existing.total, 'change_due', v_existing.change_due, 'duplicate', true);
    END IF;
  END IF;

  v_outlet_id := COALESCE(p_outlet_id, public.get_user_outlet(p_cashier_id));

  PERFORM pg_advisory_xact_lock(hashtext('sales_invoice_number'));
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 5) AS INTEGER)), 0) + 1 INTO v_next_num FROM public.sales;
  v_invoice_number := 'INV-' || LPAD(v_next_num::TEXT, 5, '0');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_line_total := (v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer - COALESCE((v_item->>'discount')::numeric, 0);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;
  v_total := v_subtotal - p_discount;

  INSERT INTO public.sales (id, invoice_number, cashier_id, customer_name, payment_method, subtotal, discount, total, tax,
    amount_tendered, change_due, notes, prescription_id, status, outlet_id, client_id, device_id, created_at)
  VALUES (gen_random_uuid(), v_invoice_number, p_cashier_id, p_customer_name, p_payment_method, v_subtotal, p_discount, v_total, 0,
    p_amount_tendered, GREATEST(p_amount_tendered - v_total, 0), p_notes, p_prescription_id, 'paid', v_outlet_id, p_client_id, p_device_id,
    COALESCE(p_created_at, now()))
  RETURNING id INTO v_sale_id;

  PERFORM set_config('app.skip_product_movement', '1', true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    v_line_total := (v_item->>'unit_price')::numeric * v_qty - COALESCE((v_item->>'discount')::numeric, 0);

    INSERT INTO public.sale_items (sale_id, product_id, unit_price, quantity, discount, line_total)
    VALUES (v_sale_id, (v_item->>'product_id')::uuid, (v_item->>'unit_price')::numeric, v_qty, COALESCE((v_item->>'discount')::numeric, 0), v_line_total);

    SELECT id, name, qty INTO v_prod FROM public.products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

    -- Outlet-level availability check (flag instead of discard for synced/offline sales)
    IF v_outlet_id IS NOT NULL THEN
      SELECT quantity INTO v_outlet_qty FROM public.outlet_stock WHERE outlet_id = v_outlet_id AND product_id = v_prod.id;
      IF v_outlet_qty IS NOT NULL AND v_outlet_qty < v_qty THEN
        IF p_client_id IS NULL THEN
          RAISE EXCEPTION 'Insufficient stock for %: available %, requested %', v_prod.name, v_outlet_qty, v_qty;
        END IF;
        v_flagged := true;
        INSERT INTO public.sync_conflicts (entity_type, entity_id, client_id, outlet_id, device_id, user_id, reason, details)
        VALUES ('sale', v_sale_id, p_client_id, v_outlet_id, p_device_id, p_cashier_id, 'shortage',
          jsonb_build_object('product_id', v_prod.id, 'product_name', v_prod.name, 'available', v_outlet_qty, 'requested', v_qty, 'invoice_number', v_invoice_number));
      END IF;
    END IF;

    UPDATE public.products SET qty = qty - v_qty WHERE id = v_prod.id;

    INSERT INTO public.stock_movements (product_id, sale_id, movement_type, quantity, quantity_before, quantity_after, reason, reference, user_id, outlet_id, created_at)
    VALUES (v_prod.id, v_sale_id, 'out', v_qty, v_prod.qty, v_prod.qty - v_qty, 'Sale', v_invoice_number, p_cashier_id, v_outlet_id, COALESCE(p_created_at, now()));
  END LOOP;

  RETURN jsonb_build_object('sale_id', v_sale_id, 'invoice_number', v_invoice_number, 'total', v_total,
    'change_due', GREATEST(p_amount_tendered - v_total, 0), 'flagged', v_flagged);
END; $function$;

-- ===== CONFIRM DOCUMENT: tag movements with the document's outlet =====
CREATE OR REPLACE FUNCTION public.confirm_document(p_document_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_doc record;
  v_prefix text;
  v_next_num integer;
  v_doc_number text;
  v_item record;
  v_qty_before integer;
  v_qty_after integer;
  v_movement_type text;
  v_stock_affected boolean := false;
  v_movements_count integer := 0;
  v_has_items boolean;
  v_outlet_id uuid;
BEGIN
  PERFORM 1 FROM public.documents WHERE id = p_document_id FOR UPDATE;
  SELECT d.*, dt.code AS type_code, dt.prefix AS type_prefix, dt.affects_stock
  INTO v_doc FROM public.documents d LEFT JOIN public.document_types dt ON dt.id = d.document_type_id WHERE d.id = p_document_id;
  IF v_doc IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF v_doc.status != 'draft' THEN RAISE EXCEPTION 'Document is already %', v_doc.status; END IF;

  v_outlet_id := COALESCE(v_doc.outlet_id, public.get_user_outlet(p_user_id));
  IF v_doc.outlet_id IS NULL AND v_outlet_id IS NOT NULL THEN
    UPDATE public.documents SET outlet_id = v_outlet_id WHERE id = p_document_id;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.document_items WHERE document_id = p_document_id) INTO v_has_items;
  IF NOT v_has_items AND (v_doc.affects_stock IS NOT NULL AND v_doc.affects_stock != 'none') THEN
    RAISE EXCEPTION 'Document has no items but affects stock';
  END IF;
  IF NOT v_has_items AND v_doc.total <= 0 THEN
    RAISE EXCEPTION 'Document has no items and no total amount';
  END IF;

  IF v_doc.type_code IS NOT NULL THEN
    UPDATE public.document_types SET next_number = next_number + 1, updated_at = now()
    WHERE code = v_doc.type_code RETURNING prefix, (next_number - 1) INTO v_prefix, v_next_num;
    v_doc_number := v_prefix || '-' || LPAD(v_next_num::text, 5, '0');
  ELSE
    v_prefix := CASE v_doc.category
      WHEN 'Purchases' THEN 'PUR' WHEN 'Stock Returns' THEN 'RET' WHEN 'Loss & Damages' THEN 'LOS'
      WHEN 'Inventory Count' THEN 'CNT' WHEN 'Expenses' THEN 'EXP' WHEN 'Proforma' THEN 'PRO' ELSE 'DOC' END;
    SELECT COALESCE(MAX(CAST(SUBSTRING(doc_number FROM position('-' IN doc_number) + 1) AS INTEGER)), 0) + 1
    INTO v_next_num FROM public.documents WHERE doc_number IS NOT NULL AND doc_number LIKE v_prefix || '-%';
    v_doc_number := v_prefix || '-' || LPAD(v_next_num::text, 5, '0');
  END IF;

  IF v_has_items AND v_doc.affects_stock IS NOT NULL AND v_doc.affects_stock != 'none' THEN
    v_stock_affected := true;
    v_movement_type := CASE v_doc.affects_stock WHEN 'add' THEN 'in' WHEN 'deduct' THEN 'out' WHEN 'set' THEN 'adjustment' ELSE 'adjustment' END;
    PERFORM set_config('app.skip_product_movement', '1', true);

    FOR v_item IN
      SELECT di.product_id, di.quantity, di.unit_price, p.qty AS current_qty, p.name AS product_name
      FROM public.document_items di JOIN public.products p ON p.id = di.product_id
      WHERE di.document_id = p_document_id FOR UPDATE OF p
    LOOP
      v_qty_before := v_item.current_qty;
      IF v_doc.affects_stock = 'add' THEN
        v_qty_after := v_qty_before + v_item.quantity;
      ELSIF v_doc.affects_stock = 'deduct' THEN
        v_qty_after := v_qty_before - v_item.quantity;
        IF v_qty_after < 0 THEN
          RAISE EXCEPTION 'Insufficient stock for %: available %, requested %', v_item.product_name, v_qty_before, v_item.quantity;
        END IF;
      ELSIF v_doc.affects_stock = 'set' THEN
        v_qty_after := v_item.quantity;
      END IF;

      UPDATE public.products SET qty = v_qty_after WHERE id = v_item.product_id;

      INSERT INTO public.stock_movements (product_id, document_id, movement_type, quantity, quantity_before, quantity_after, reason, reference, user_id, outlet_id)
      VALUES (v_item.product_id, p_document_id, v_movement_type, v_item.quantity, v_qty_before, v_qty_after,
        v_doc.category || ' - ' || v_doc.sub_type, v_doc_number, p_user_id, v_outlet_id);
      v_movements_count := v_movements_count + 1;
    END LOOP;
  END IF;

  UPDATE public.documents SET doc_number = v_doc_number, status = 'posted', updated_at = now() WHERE id = p_document_id;
  INSERT INTO public.activity_log (user_id, action, module, document_ref) VALUES (p_user_id, 'Confirmed document', 'Documents', v_doc_number);

  RETURN jsonb_build_object('doc_number', v_doc_number, 'status', 'posted', 'stock_affected', v_stock_affected, 'movements_created', v_movements_count);
END; $function$;

-- Cross-outlet availability (last-known per outlet)
CREATE OR REPLACE FUNCTION public.product_availability(p_search text DEFAULT NULL)
RETURNS TABLE(product_id uuid, product_name text, category text, uom text, sales_price numeric, expiry_date date, total_qty integer,
  outlet_id uuid, outlet_name text, outlet_code text, quantity integer, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.category, p.uom, p.sales_price, p.expiry_date, p.qty,
         o.id, o.name, o.code, COALESCE(os.quantity, 0), os.updated_at
  FROM public.products p
  CROSS JOIN public.outlets o
  LEFT JOIN public.outlet_stock os ON os.product_id = p.id AND os.outlet_id = o.id
  WHERE o.is_active
    AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%' OR p.category ILIKE '%' || p_search || '%')
  ORDER BY p.name, o.sort_order, o.name
$$;