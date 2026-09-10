ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'retail';

DROP FUNCTION IF EXISTS public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid, uuid, text, timestamptz);

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
  p_created_at timestamptz DEFAULT NULL,
  p_sale_type text DEFAULT 'retail'
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
  v_sale_type text;
BEGIN
  v_sale_type := CASE WHEN lower(COALESCE(p_sale_type, 'retail')) = 'wholesale' THEN 'wholesale' ELSE 'retail' END;

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
    amount_tendered, change_due, notes, prescription_id, status, outlet_id, client_id, device_id, sale_type, created_at)
  VALUES (gen_random_uuid(), v_invoice_number, p_cashier_id, p_customer_name, p_payment_method, v_subtotal, p_discount, v_total, 0,
    p_amount_tendered, GREATEST(p_amount_tendered - v_total, 0), p_notes, p_prescription_id, 'paid', v_outlet_id, p_client_id, p_device_id,
    v_sale_type, COALESCE(p_created_at, now()))
  RETURNING id INTO v_sale_id;

  PERFORM set_config('app.skip_product_movement', '1', true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    v_line_total := (v_item->>'unit_price')::numeric * v_qty - COALESCE((v_item->>'discount')::numeric, 0);

    INSERT INTO public.sale_items (sale_id, product_id, unit_price, quantity, discount, line_total)
    VALUES (v_sale_id, (v_item->>'product_id')::uuid, (v_item->>'unit_price')::numeric, v_qty, COALESCE((v_item->>'discount')::numeric, 0), v_line_total);

    SELECT id, name, qty INTO v_prod FROM public.products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

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

REVOKE EXECUTE ON FUNCTION public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid, uuid, text, timestamptz, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.process_sale(uuid, text, text, numeric, numeric, text, uuid, jsonb, uuid, uuid, text, timestamptz, text) TO authenticated, service_role;