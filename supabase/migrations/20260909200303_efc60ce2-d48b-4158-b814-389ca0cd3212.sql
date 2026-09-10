DROP POLICY IF EXISTS "Users update own devices" ON public.devices;
CREATE POLICY "Users update own devices" ON public.devices
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authorized roles can update documents" ON public.documents;
CREATE POLICY "Authorized roles can update documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
    OR (
      (public.has_role(auth.uid(), 'pharmacist'::app_role) OR public.has_role(auth.uid(), 'cashier'::app_role))
      AND (user_id = auth.uid() OR (outlet_id IS NOT NULL AND outlet_id = public.get_user_outlet(auth.uid())))
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'ceo'::app_role)
    OR (
      (public.has_role(auth.uid(), 'pharmacist'::app_role) OR public.has_role(auth.uid(), 'cashier'::app_role))
      AND (user_id = auth.uid() OR (outlet_id IS NOT NULL AND outlet_id = public.get_user_outlet(auth.uid())))
    )
  );