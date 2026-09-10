-- 1. Scope line-item reads to the parent record's rules
DROP POLICY IF EXISTS "Staff can view sale items in scope" ON public.sale_items;
CREATE POLICY "Staff can view sale items in scope" ON public.sale_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo') OR has_role(auth.uid(),'pharmacist')
  OR s.cashier_id = auth.uid() OR (s.outlet_id IS NOT NULL AND s.outlet_id = get_user_outlet(auth.uid())))));

DROP POLICY IF EXISTS "Staff can view document items in scope" ON public.document_items;
CREATE POLICY "Staff can view document items in scope" ON public.document_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_items.document_id AND (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo') OR has_role(auth.uid(),'pharmacist')
  OR d.user_id = auth.uid() OR (d.outlet_id IS NOT NULL AND d.outlet_id = get_user_outlet(auth.uid())))));

-- 2. Transfers and handovers
DROP POLICY IF EXISTS "Staff can view transfers" ON public.stock_transfers;
CREATE POLICY "Staff can view transfers in scope" ON public.stock_transfers FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo')
  OR from_outlet_id = get_user_outlet(auth.uid()) OR to_outlet_id = get_user_outlet(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view handovers" ON public.shift_handovers;
CREATE POLICY "Involved staff and management view handovers" ON public.shift_handovers FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo') OR outgoing_user_id = auth.uid() OR incoming_user_id = auth.uid());

-- 3. Product writes: remove cashier
DROP POLICY IF EXISTS "Staff can insert products" ON public.products;
CREATE POLICY "Staff can insert products" ON public.products FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'ceo'));
DROP POLICY IF EXISTS "Staff can update products" ON public.products;
CREATE POLICY "Staff can update products" ON public.products FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'ceo'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'ceo'));

-- 4. Profiles: restrict policies to authenticated and protect sensitive columns from self-edit
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.trg_protect_profile_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.outlet_id IS DISTINCT FROM OLD.outlet_id
     OR NEW.status IS DISTINCT FROM OLD.status OR NEW.username IS DISTINCT FROM OLD.username
     OR NEW.email IS DISTINCT FROM OLD.email OR NEW.otp_enabled IS DISTINCT FROM OLD.otp_enabled
     OR NEW.otp_email IS DISTINCT FROM OLD.otp_email OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Only an administrator can change this account setting';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_profile_columns ON public.profiles;
CREATE TRIGGER protect_profile_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.trg_protect_profile_columns();

-- 5. Harden process_sale: caller identity, role, outlet and item validation
CREATE OR REPLACE FUNCTION public.process_sale(p_cashier_id uuid, p_customer_name text DEFAULT 'Walk-in'::text, p_payment_method text DEFAULT 'Cash'::text, p_discount numeric DEFAULT 0, p_amount_tendered numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_prescription_id uuid DEFAULT NULL::uuid, p_items jsonb DEFAULT '[]'::jsonb, p_outlet_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_device_id text DEFAULT NULL::text, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sale_type text DEFAULT 'retail'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_sale_id uuid; v_subtotal numeric := 0; v_total numeric := 0; v_item jsonb; v_line_total numeric;
  v_invoice_number text; v_next_num integer; v_outlet_id uuid; v_existing record; v_prod record;
  v_outlet_qty integer; v_qty integer; v_flagged boolean := false; v_sale_type text;
  v_uid uuid := auth.uid(); v_is_mgmt boolean; v_own_outlet uuid; v_price numeric; v_disc numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_cashier_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Sales can only be recorded for the signed-in user'; END IF;
  IF NOT (has_role(v_uid,'admin') OR has_role(v_uid,'pharmacist') OR has_role(v_uid,'cashier')) THEN
    RAISE EXCEPTION 'Your role cannot record sales';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND COALESCE(status,'active') = 'active') THEN
    RAISE EXCEPTION 'Account is not active';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'A sale needs at least one item'; END IF;
  IF jsonb_array_length(p_items) > 200 THEN RAISE EXCEPTION 'Too many items in one sale'; END IF;
  IF COALESCE(p_discount,0) < 0 OR COALESCE(p_amount_tendered,0) < 0 THEN RAISE EXCEPTION 'Invalid amounts'; END IF;
  IF p_created_at IS NOT NULL AND (p_created_at > now() + interval '10 minutes' OR p_created_at < now() - interval '14 days') THEN
    RAISE EXCEPTION 'Sale time is outside the allowed offline window';
  END IF;

  v_sale_type := CASE WHEN lower(COALESCE(p_sale_type, 'retail')) = 'wholesale' THEN 'wholesale' ELSE 'retail' END;

  IF p_client_id IS NOT NULL THEN
    SELECT id, invoice_number, total, change_due INTO v_existing FROM public.sales WHERE client_id = p_client_id;
    IF FOUND THEN
      RETURN jsonb_build_object('sale_id', v_existing.id, 'invoice_number', v_existing.invoice_number,
        'total', v_existing.total, 'change_due', v_existing.change_due, 'duplicate', true);
    END IF;
  END IF;

  v_is_mgmt := has_role(v_uid,'admin');
  v_own_outlet := public.get_user_outlet(v_uid);
  IF v_is_mgmt THEN
    v_outlet_id := COALESCE(p_outlet_id, v_own_outlet);
  ELSE
    IF v_own_outlet IS NULL THEN RAISE EXCEPTION 'Staff member has no outlet assignment'; END IF;
    IF p_outlet_id IS NOT NULL AND p_outlet_id <> v_own_outlet THEN RAISE EXCEPTION 'You can only sell from your own branch'; END IF;
    v_outlet_id := v_own_outlet;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sales_invoice_number'));
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 5) AS INTEGER)), 0) + 1 INTO v_next_num FROM public.sales;
  v_invoice_number := 'INV-' || LPAD(v_next_num::TEXT, 5, '0');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer; v_price := (v_item->>'unit_price')::numeric; v_disc := COALESCE((v_item->>'discount')::numeric, 0);
    IF v_qty IS NULL OR v_qty <= 0 OR v_price IS NULL OR v_price < 0 OR v_disc < 0 OR v_disc > v_price * v_qty THEN
      RAISE EXCEPTION 'Invalid sale item';
    END IF;
    v_subtotal := v_subtotal + (v_price * v_qty - v_disc);
  END LOOP;
  v_total := v_subtotal - COALESCE(p_discount,0);
  IF v_total < 0 THEN RAISE EXCEPTION 'Discount exceeds sale total'; END IF;

  INSERT INTO public.sales (id, invoice_number, cashier_id, customer_name, payment_method, subtotal, discount, total, tax,
    amount_tendered, change_due, notes, prescription_id, status, outlet_id, client_id, device_id, sale_type, created_at)
  VALUES (gen_random_uuid(), v_invoice_number, v_uid, left(COALESCE(p_customer_name,'Walk-in'),120), left(COALESCE(p_payment_method,'Cash'),40), v_subtotal, COALESCE(p_discount,0), v_total, 0,
    COALESCE(p_amount_tendered,0), GREATEST(COALESCE(p_amount_tendered,0) - v_total, 0), left(p_notes,1000), p_prescription_id, 'paid', v_outlet_id, p_client_id, left(p_device_id,120),
    v_sale_type, COALESCE(p_created_at, now()))
  RETURNING id INTO v_sale_id;

  PERFORM set_config('app.skip_product_movement', '1', true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    v_line_total := (v_item->>'unit_price')::numeric * v_qty - COALESCE((v_item->>'discount')::numeric, 0);

    SELECT id, name, qty INTO v_prod FROM public.products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

    INSERT INTO public.sale_items (sale_id, product_id, unit_price, quantity, discount, line_total)
    VALUES (v_sale_id, v_prod.id, (v_item->>'unit_price')::numeric, v_qty, COALESCE((v_item->>'discount')::numeric, 0), v_line_total);

    IF v_outlet_id IS NOT NULL THEN
      SELECT quantity INTO v_outlet_qty FROM public.outlet_stock WHERE outlet_id = v_outlet_id AND product_id = v_prod.id;
      IF v_outlet_qty IS NOT NULL AND v_outlet_qty < v_qty THEN
        IF p_client_id IS NULL THEN
          RAISE EXCEPTION 'Insufficient stock for %: available %, requested %', v_prod.name, v_outlet_qty, v_qty;
        END IF;
        v_flagged := true;
        INSERT INTO public.sync_conflicts (entity_type, entity_id, client_id, outlet_id, device_id, user_id, reason, details)
        VALUES ('sale', v_sale_id, p_client_id, v_outlet_id, p_device_id, v_uid, 'shortage',
          jsonb_build_object('product_id', v_prod.id, 'product_name', v_prod.name, 'available', v_outlet_qty, 'requested', v_qty, 'invoice_number', v_invoice_number));
      END IF;
    END IF;

    UPDATE public.products SET qty = qty - v_qty WHERE id = v_prod.id;

    INSERT INTO public.stock_movements (product_id, sale_id, movement_type, quantity, quantity_before, quantity_after, reason, reference, user_id, outlet_id, created_at)
    VALUES (v_prod.id, v_sale_id, 'out', v_qty, v_prod.qty, v_prod.qty - v_qty, 'Sale', v_invoice_number, v_uid, v_outlet_id, COALESCE(p_created_at, now()));
  END LOOP;

  RETURN jsonb_build_object('sale_id', v_sale_id, 'invoice_number', v_invoice_number, 'total', v_total,
    'change_due', GREATEST(COALESCE(p_amount_tendered,0) - v_total, 0), 'flagged', v_flagged);
END; $function$;

-- 6. Role lookup limited to self or management
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
 RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
    AND (_user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo'))
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.list_ceo_users()
 RETURNS TABLE(user_id uuid, full_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT p.user_id, p.full_name
  FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE auth.uid() IS NOT NULL AND ur.role = 'ceo' AND COALESCE(p.status, 'active') = 'active'
  ORDER BY p.full_name;
$function$;

-- 7. Function grants: nothing for visitors; server-only routines not callable by staff
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.confirm_document(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.add_document_payment(uuid, uuid, numeric, uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_document_totals(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_document(uuid, text, text, text, text, text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_next_doc_number(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_email_by_username(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_document(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_document_payment(uuid, uuid, numeric, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_document_totals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_document(uuid, text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_next_doc_number(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_outlet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_ceo_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid, uuid, text, timestamptz, text) TO authenticated;

-- 8. Indexes for policy lookups
CREATE INDEX IF NOT EXISTS idx_payments_received_by ON public.payments(received_by);
CREATE INDEX IF NOT EXISTS idx_requisitions_user_id ON public.requisitions(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user_id ON public.stock_movements(user_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON public.devices(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_outlet_id ON public.profiles(outlet_id);
CREATE INDEX IF NOT EXISTS idx_shift_handovers_users ON public.shift_handovers(outgoing_user_id, incoming_user_id);