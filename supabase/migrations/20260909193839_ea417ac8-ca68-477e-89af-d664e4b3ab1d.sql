-- 1. Fixed search_path on email queue helpers
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

-- 2. Revoke EXECUTE on all public functions from anon/authenticated, then re-grant only what the app uses
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_outlet(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_document_payment(uuid, uuid, numeric, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_unassigned_to_outlet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_stock_snapshots() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_documents(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_products(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_document(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_unassigned_records() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_device_synced(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_availability(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_document_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_offline_device(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_stock_transfer(uuid, uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_stock_transfer(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_system_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.take_stock_snapshot(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_ceo_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_doc_number(text) TO authenticated;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('process_sale', 'process_document', 'sync_offline_document')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

-- 3. Outlet-scoped reads for financial records
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;
CREATE POLICY "Staff can view sales in scope" ON public.sales FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo') OR has_role(auth.uid(), 'pharmacist')
  OR cashier_id = auth.uid()
  OR (outlet_id IS NOT NULL AND outlet_id = get_user_outlet(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can view sale items" ON public.sale_items;
CREATE POLICY "Staff can view sale items in scope" ON public.sale_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id));

DROP POLICY IF EXISTS "Authenticated users can view documents" ON public.documents;
CREATE POLICY "Staff can view documents in scope" ON public.documents FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo') OR has_role(auth.uid(), 'pharmacist')
  OR user_id = auth.uid()
  OR (outlet_id IS NOT NULL AND outlet_id = get_user_outlet(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can view document items" ON public.document_items;
CREATE POLICY "Staff can view document items in scope" ON public.document_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_items.document_id));

DROP POLICY IF EXISTS "Authenticated users can view payments" ON public.payments;
CREATE POLICY "Staff can view payments in scope" ON public.payments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo') OR has_role(auth.uid(), 'pharmacist')
  OR received_by = auth.uid()
  OR (outlet_id IS NOT NULL AND outlet_id = get_user_outlet(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can view stock movements" ON public.stock_movements;
CREATE POLICY "Staff can view stock movements in scope" ON public.stock_movements FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo') OR has_role(auth.uid(), 'pharmacist')
  OR user_id = auth.uid()
  OR (outlet_id IS NOT NULL AND outlet_id = get_user_outlet(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can view requisitions" ON public.requisitions;
CREATE POLICY "Staff can view requisitions in scope" ON public.requisitions FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo') OR has_role(auth.uid(), 'pharmacist')
  OR user_id = auth.uid()
  OR (outlet_id IS NOT NULL AND outlet_id = get_user_outlet(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can view symptom logs" ON public.symptom_log;
CREATE POLICY "Owners and leadership view symptom logs" ON public.symptom_log FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'ceo') OR cashier_id = auth.uid());

-- 4. Document types: CEO read-only
DROP POLICY IF EXISTS "CEO can manage document types" ON public.document_types;

-- 5. user_roles: CEO cannot enumerate admin assignments
DROP POLICY IF EXISTS "CEOs can view assigned roles" ON public.user_roles;
CREATE POLICY "CEOs can view non-admin roles" ON public.user_roles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ceo') AND role <> 'admin'::app_role);

-- 6. sync_conflicts insert ownership
DROP POLICY IF EXISTS "Authenticated insert conflicts" ON public.sync_conflicts;
CREATE POLICY "Users insert own conflicts" ON public.sync_conflicts FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- 7. Storage: company-assets holds branding images only
DROP POLICY IF EXISTS "Public read company-assets files" ON storage.objects;
DROP POLICY IF EXISTS "Admin can upload company assets" ON storage.objects;
CREATE POLICY "Admin can upload branding assets" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-assets'
  AND has_role(auth.uid(), 'admin')
  AND (name ILIKE 'logo_%' OR name ILIKE 'favicon_%')
  AND lower(storage.extension(name)) IN ('png', 'jpg', 'jpeg', 'webp', 'svg', 'ico', 'gif')
);