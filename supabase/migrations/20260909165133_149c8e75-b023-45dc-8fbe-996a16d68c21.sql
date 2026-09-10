CREATE POLICY "CEOs can view assigned roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ceo'::public.app_role));