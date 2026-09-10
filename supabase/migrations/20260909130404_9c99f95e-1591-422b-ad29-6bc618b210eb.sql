CREATE OR REPLACE FUNCTION public.register_offline_device(p_device_key text, p_name text DEFAULT NULL::text, p_platform text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  -- Admins and the CEO create and assign outlets themselves, so they may register
  -- before any outlet exists. All other staff need an outlet assignment first.
  IF v_outlet_id IS NULL AND v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'ceo' THEN
    RAISE EXCEPTION 'Staff member has no outlet assignment';
  END IF;

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