REVOKE EXECUTE ON FUNCTION public.trg_protect_profile_columns() FROM authenticated, anon, PUBLIC;
CREATE OR REPLACE FUNCTION public.count_unassigned_records()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'ceo')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN jsonb_build_object(
    'profiles', (SELECT count(*) FROM public.profiles WHERE outlet_id IS NULL),
    'sales', (SELECT count(*) FROM public.sales WHERE outlet_id IS NULL),
    'documents', (SELECT count(*) FROM public.documents WHERE outlet_id IS NULL),
    'stock_movements', (SELECT count(*) FROM public.stock_movements WHERE outlet_id IS NULL),
    'requisitions', (SELECT count(*) FROM public.requisitions WHERE outlet_id IS NULL),
    'payments', (SELECT count(*) FROM public.payments WHERE outlet_id IS NULL)
  );
END $$;