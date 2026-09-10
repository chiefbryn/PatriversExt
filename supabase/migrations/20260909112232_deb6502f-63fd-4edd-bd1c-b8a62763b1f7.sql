CREATE OR REPLACE FUNCTION public.sync_offline_document(
  p_user_id uuid,
  p_category text,
  p_sub_type text,
  p_document_type_id uuid DEFAULT NULL,
  p_external_ref text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_tax numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_amount numeric DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_outlet_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_existing record;
  v_doc_id uuid;
  v_outlet_id uuid;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_line_amount numeric;
  v_confirmed jsonb;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;
  IF p_category NOT IN ('Expenses', 'Purchases') THEN
    RAISE EXCEPTION 'Offline synchronization supports Expenses and Purchases only';
  END IF;

  SELECT id, doc_number, status, total INTO v_existing
  FROM public.documents WHERE client_id = p_client_id;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_existing.id, 'doc_number', v_existing.doc_number,
      'status', v_existing.status, 'total', v_existing.total, 'duplicate', true);
  END IF;

  v_outlet_id := COALESCE(p_outlet_id, public.get_user_outlet(p_user_id));
  IF v_outlet_id IS NULL THEN RAISE EXCEPTION 'Staff member has no outlet assignment'; END IF;
  IF public.get_user_outlet(p_user_id) IS DISTINCT FROM v_outlet_id THEN
    RAISE EXCEPTION 'Outlet assignment does not match';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    IF NULLIF(v_item->>'product_id', '') IS NULL OR COALESCE((v_item->>'quantity')::integer, 0) <= 0 THEN
      RAISE EXCEPTION 'Invalid document item';
    END IF;
    v_line_amount := (v_item->>'quantity')::integer * COALESCE((v_item->>'unit_price')::numeric, 0);
    v_subtotal := v_subtotal + v_line_amount;
  END LOOP;
  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    v_subtotal := COALESCE(p_amount, 0);
  END IF;
  v_total := round((v_subtotal + COALESCE(p_tax, 0) - COALESCE(p_discount, 0)) * 100) / 100;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Document total must be greater than zero'; END IF;

  INSERT INTO public.documents (
    category, sub_type, document_type_id, external_ref, customer_name, user_id,
    amount, status, notes, period_date, created_at, quantity, subtotal, tax,
    discount, total, payment_status, amount_paid, balance_due, metadata,
    outlet_id, client_id, device_id
  ) VALUES (
    trim(p_category), trim(p_sub_type), p_document_type_id, NULLIF(trim(p_external_ref), ''),
    NULLIF(trim(p_customer_name), ''), p_user_id, v_total, 'draft', NULLIF(trim(p_notes), ''),
    COALESCE(p_created_at, now())::date, COALESCE(p_created_at, now()),
    jsonb_array_length(COALESCE(p_items, '[]'::jsonb)), v_subtotal, COALESCE(p_tax, 0),
    COALESCE(p_discount, 0), v_total, 'unpaid', 0, v_total, COALESCE(p_metadata, '{}'::jsonb),
    v_outlet_id, p_client_id, p_device_id
  ) RETURNING id INTO v_doc_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_line_amount := (v_item->>'quantity')::integer * COALESCE((v_item->>'unit_price')::numeric, 0);
    INSERT INTO public.document_items (
      document_id, product_id, quantity, unit_price, amount, batch_number, expiry_date, notes
    ) VALUES (
      v_doc_id, (v_item->>'product_id')::uuid, (v_item->>'quantity')::integer,
      COALESCE((v_item->>'unit_price')::numeric, 0), v_line_amount,
      NULLIF(trim(v_item->>'batch_number'), ''), NULLIF(v_item->>'expiry_date', '')::date,
      NULLIF(trim(v_item->>'notes'), '')
    );
  END LOOP;

  SELECT public.confirm_document(v_doc_id, p_user_id) INTO v_confirmed;
  RETURN jsonb_build_object('id', v_doc_id, 'doc_number', v_confirmed->>'doc_number',
    'status', v_confirmed->>'status', 'total', v_total, 'duplicate', false,
    'movements_created', COALESCE((v_confirmed->>'movements_created')::integer, 0));
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_offline_document(uuid, text, text, uuid, text, text, text, numeric, numeric, numeric, jsonb, jsonb, uuid, uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_offline_document(uuid, text, text, uuid, text, text, text, numeric, numeric, numeric, jsonb, jsonb, uuid, uuid, text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.register_offline_device(
  p_device_key text,
  p_name text DEFAULT NULL,
  p_platform text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_outlet_id uuid;
  v_role public.app_role;
  v_status text;
  v_device public.devices%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NULLIF(trim(p_device_key), '') IS NULL THEN RAISE EXCEPTION 'device_key is required'; END IF;

  SELECT p.outlet_id, p.status INTO v_outlet_id, v_status
  FROM public.profiles p WHERE p.user_id = v_user_id;
  SELECT ur.role INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_user_id LIMIT 1;
  IF v_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Account is not active'; END IF;
  IF v_outlet_id IS NULL THEN RAISE EXCEPTION 'Staff member has no outlet assignment'; END IF;

  INSERT INTO public.devices (device_key, user_id, outlet_id, name, platform, last_seen_at, offline_access_until, revoked_at)
  VALUES (trim(p_device_key), v_user_id, v_outlet_id, NULLIF(trim(p_name), ''), NULLIF(trim(p_platform), ''), now(), now() + interval '7 days', NULL)
  ON CONFLICT (device_key) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    outlet_id = EXCLUDED.outlet_id,
    name = EXCLUDED.name,
    platform = EXCLUDED.platform,
    last_seen_at = now(),
    offline_access_until = now() + interval '7 days',
    revoked_at = NULL,
    updated_at = now()
  WHERE public.devices.user_id = v_user_id OR public.devices.revoked_at IS NOT NULL
  RETURNING * INTO v_device;

  IF v_device.id IS NULL THEN RAISE EXCEPTION 'This device is registered to another account'; END IF;
  RETURN jsonb_build_object(
    'device_id', v_device.id, 'device_key', v_device.device_key, 'user_id', v_user_id,
    'outlet_id', v_outlet_id, 'role', v_role, 'offline_access_until', v_device.offline_access_until
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.register_offline_device(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_offline_device(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_device_synced(p_device_key text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_synced_at timestamptz := now();
BEGIN
  UPDATE public.devices SET last_sync_at = v_synced_at, last_seen_at = v_synced_at, updated_at = v_synced_at
  WHERE device_key = p_device_key AND user_id = auth.uid() AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active device not found'; END IF;
  RETURN v_synced_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_device_synced(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_device_synced(text) TO authenticated, service_role;