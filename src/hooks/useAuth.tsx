import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { AppRole } from '@/lib/roles';
import { createPasswordVerifier, getDeviceKey, getOfflineAuthorization, getOfflineAuthorizationByUsername, saveOfflineAuthorization, setOfflineMeta, verifyOfflinePassword, clearCurrentOfflineUser, clearOfflineDataOnSignOut, removeOfflineAuthorization } from '@/lib/offlineDb';
import { fetchAllProducts } from '@/hooks/useProducts';

interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: { full_name: string; must_change_password: boolean; outlet_id?: string | null } | null;
  loading: boolean;
  isIdle: boolean;
  otpRequired: boolean;
  otpEmailMasked: string | null;
}

interface AuthContextType extends AuthState {
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
  dismissIdle: () => void;
  verifyOtp: (code: string) => Promise<{ error?: string }>;
  resendOtp: () => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes -> show screensaver (no auto-logout)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    profile: null,
    loading: true,
    isIdle: false,
    otpRequired: false,
    otpEmailMasked: null,
  });

  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const signOutRef = useRef<() => Promise<void>>();
  const passwordChangeInProgressRef = useRef(false);

  // Fetch role and profile (incl. OTP config and outlet assignment)
  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const [roleRes, profileRes] = await Promise.all([
        supabase.rpc('get_user_role', { _user_id: userId }),
        supabase.from('profiles').select('full_name, must_change_password, otp_enabled, otp_email, outlet_id').eq('user_id', userId).single(),
      ]);

      const role = (roleRes.data as AppRole) || null;
      const p: any = profileRes.data;
      const profile = p
        ? { full_name: p.full_name, must_change_password: p.must_change_password ?? false, outlet_id: p.outlet_id ?? null }
        : null;
      const otpEnabled = !!p?.otp_enabled && !!p?.otp_email;
      const verifiedKey = `otp_verified_${userId}`;
      const alreadyVerified = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(verifiedKey) === '1';
      const otpRequired = otpEnabled && !alreadyVerified;
      const otpEmailMasked = p?.otp_email ? maskEmail(p.otp_email) : null;

      return { role, profile, otpRequired, otpEmailMasked };
    } catch {
      const cached = await getOfflineAuthorization(userId);
      if (cached && Date.now() <= new Date(cached.expiresAt).getTime()) {
        return {
          role: cached.role,
          profile: { full_name: cached.fullName, must_change_password: false, outlet_id: cached.outletId },
          otpRequired: false,
          otpEmailMasked: null,
        };
      }
      return { role: null, profile: null, otpRequired: false, otpEmailMasked: null };
    }
  }, []);

  // Log login activity
  const logLogin = useCallback(async (userId: string, status: 'success' | 'failed') => {
    try {
      await supabase.from('login_log').insert({ user_id: userId, status });
    } catch {
      // silent fail
    }
  }, []);

  // Idle management
  const resetIdleTimer = useCallback(() => {
    if (!state.session) return;
    
    setState(prev => prev.isIdle ? { ...prev, isIdle: false } : prev);
    
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    idleTimerRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, isIdle: true }));
    }, IDLE_TIMEOUT_MS);
  }, [state.session]);

  const dismissIdle = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  // Set up idle listeners
  useEffect(() => {
    if (!state.session) return;

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handler = () => resetIdleTimer();
    
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetIdleTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, [state.session, resetIdleTimer]);

  // Auth state listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        // Use setTimeout to avoid potential deadlocks with Supabase client
        setTimeout(async () => {
          const { role, profile, otpRequired, otpEmailMasked } = await fetchUserData(session.user.id);
          setState({
            user: session.user,
            session,
            role,
            profile,
            loading: false,
            isIdle: false,
            otpRequired,
            otpEmailMasked,
          });
          if (otpRequired) {
            // Auto-send first code
            supabase.functions.invoke('send-login-otp').catch(() => {});
          }
        }, 0);
      } else if (!passwordChangeInProgressRef.current) {
        setState({
          user: null,
          session: null,
          role: null,
          profile: null,
          loading: false,
          isIdle: false,
          otpRequired: false,
          otpEmailMasked: null,
        });
      }
    });

    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserData(session.user.id).then(({ role, profile, otpRequired, otpEmailMasked }) => {
          setState({
            user: session.user,
            session,
            role,
            profile,
            loading: false,
            isIdle: false,
            otpRequired,
            otpEmailMasked,
          });
        });
      } else {
        if (!navigator.onLine) {
          getOfflineAuthorization().then(authorization => {
            if (authorization && Date.now() <= new Date(authorization.expiresAt).getTime()) {
              setState({
                user: authorization.user as unknown as User,
                session: null,
                role: authorization.role,
                profile: { full_name: authorization.fullName, must_change_password: false, outlet_id: authorization.outletId },
                loading: false,
                isIdle: false,
                otpRequired: false,
                otpEmailMasked: null,
              });
            } else setState(prev => ({ ...prev, loading: false }));
          });
        } else setState(prev => ({ ...prev, loading: false }));
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  useEffect(() => {
    const revalidate = async () => {
      if (!state.user) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await clearCurrentOfflineUser();
        setState({ user: null, session: null, role: null, profile: null, loading: false, isIdle: false, otpRequired: false, otpEmailMasked: null });
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('status, outlet_id')
        .eq('user_id', state.user.id)
        .maybeSingle();
      // A reconnect event can fire before the network or refreshed session is fully
      // ready. Never turn a temporary lookup failure into a forced logout.
      if (profileError) return;
      // Admins and the CEO work across outlets, so they may have no outlet assigned.
      const outletRequired = state.role !== 'admin' && state.role !== 'ceo';
      const outletInvalid = outletRequired
        ? !profile?.outlet_id || profile.outlet_id !== state.profile?.outlet_id
        : false;
      if (!profile || profile.status !== 'active' || outletInvalid) {
        // Account suspended or reassigned: revoke this device's offline authorization too.
        await removeOfflineAuthorization(state.user.id);
        await supabase.auth.signOut();
      }
    };
    // Re-check on reconnect and periodically while online, so a suspension takes
    // effect within minutes rather than at the next page load.
    const interval = window.setInterval(() => { if (navigator.onLine) void revalidate(); }, 5 * 60_000);
    window.addEventListener('online', revalidate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', revalidate);
    };
  }, [state.profile?.outlet_id, state.role, state.user]);

  const signIn = async (username: string, password: string): Promise<{ error?: string }> => {
    const normalizedUsername = username.trim().toLowerCase();
    if (!navigator.onLine) {
      const authorization = await getOfflineAuthorizationByUsername(normalizedUsername);
      if (!authorization) {
        return { error: 'This account has not been authorized for offline use on this device.' };
      }
      if (Date.now() > new Date(authorization.expiresAt).getTime()) {
        return { error: 'Offline access has expired. Connect to the internet to authorize this device again.' };
      }
      if (!(await verifyOfflinePassword(password, authorization.passwordSalt, authorization.passwordVerifier))) {
        return { error: 'Incorrect username or password.' };
      }
      setState({
        user: authorization.user as unknown as User,
        session: null,
        role: authorization.role,
        profile: { full_name: authorization.fullName, must_change_password: false, outlet_id: authorization.outletId },
        loading: false,
        isIdle: false,
        otpRequired: false,
        otpEmailMasked: null,
      });
      return {};
    }
    // Staff accounts use a synthetic internal address derived from the username, so no
    // anonymous username lookup is needed (and none is exposed).
    if (!/^[a-z0-9._-]{3,64}$/.test(normalizedUsername)) return { error: 'Incorrect username or password.' };
    const email = `${normalizedUsername}@patrivers.local`;

    // Auto-retry sign-in on transient 5xx / timeout errors (Auth backend hiccups)
    const isTransient = (msg: string) => {
      const m = (msg || '').toLowerCase();
      return m.includes('timeout') || m.includes('timed out') || m.includes('504')
        || m.includes('502') || m.includes('503') || m.includes('fetch')
        || m.includes('network') || m.includes('deadline');
    };

    let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'] | null = null;
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await supabase.auth.signInWithPassword({ email, password });
      if (!res.error) { data = res.data; lastError = null; break; }
      lastError = res.error.message;
      if (!isTransient(lastError)) return { error: lastError };
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
    if (lastError || !data) {
      return { error: 'Login service is slow right now. Please try again in a moment.' };
    }
    if (data.user) {
      // Reject suspended/inactive accounts and terminate the session immediately
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('status')
        .eq('user_id', data.user.id)
        .maybeSingle();
      if (profileRow && profileRow.status && profileRow.status !== 'active') {
        await supabase.auth.signOut();
        await logLogin(data.user.id, 'failed').catch(() => {});
        return { error: 'This account has been suspended. Please contact your administrator.' };
      }
      const authorizationData = await fetchUserData(data.user.id);
      if (!authorizationData.role) {
        await supabase.auth.signOut();
        return { error: 'Your account has no role assigned. Please contact your administrator.' };
      }
      // Admins and the CEO manage outlets themselves, so they may sign in before any
      // outlet exists. Everyone else needs an outlet before the device can be used.
      const outletRequired = authorizationData.role !== 'admin' && authorizationData.role !== 'ceo';
      if (outletRequired && !authorizationData.profile?.outlet_id) {
        await supabase.auth.signOut();
        return { error: 'Your account must be assigned to an outlet before this device can be used.' };
      }
      const deviceKey = getDeviceKey(data.user.id);
      const { data: device, error: deviceError } = await supabase.rpc('register_offline_device' as never, {
        p_device_key: deviceKey,
        p_name: navigator.userAgent.includes('Electron') ? 'Patrivers desktop' : 'Patrivers web device',
        p_platform: navigator.platform || 'Unknown',
      } as never);
      if (deviceError) {
        await supabase.auth.signOut();
        return { error: deviceError.message };
      }
      const deviceData = device as unknown as { offline_access_until: string };
      const passwordData = await createPasswordVerifier(password);
      await saveOfflineAuthorization({
        id: data.user.id,
        username: normalizedUsername,
        user: data.user as unknown as Record<string, unknown>,
        fullName: authorizationData.profile.full_name,
        role: authorizationData.role,
        outletId: authorizationData.profile?.outlet_id ?? null,
        deviceKey,
        authorizedAt: new Date().toISOString(),
        expiresAt: deviceData.offline_access_until,
        passwordSalt: passwordData.salt,
        passwordVerifier: passwordData.verifier,
      });
      const [documentTypes, paymentTypes, outlets, companySettings] = await Promise.all([
        supabase.from('document_types').select('*').eq('is_active', true).order('name'),
        supabase.from('payment_types').select('*').eq('is_active', true).order('name'),
        supabase.from('outlets' as never).select('*').order('sort_order').order('name'),
        supabase.from('company_settings').select('*').limit(1).maybeSingle(),
        fetchAllProducts(),
      ]);
      await Promise.all([
        setOfflineMeta('document_types', documentTypes.data || []),
        setOfflineMeta('payment_types', paymentTypes.data || []),
        setOfflineMeta('outlets', outlets.data || []),
        setOfflineMeta('company_settings', companySettings.data || null),
      ]);
      await logLogin(data.user.id, 'success');
      // Update last_login
      await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('user_id', data.user.id);
      // Capture today's opening stock snapshot (idempotent)
      supabase.rpc('take_stock_snapshot' as any, { p_source: 'login' }).then(() => {}, () => {});
    }
    return {};
  };

  const signOut = async () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    // Clear OTP verification — next shift requires fresh 2FA
    try {
      if (state.user) sessionStorage.removeItem(`otp_verified_${state.user.id}`);
      // Sweep any stale keys too
      Object.keys(sessionStorage).filter(k => k.startsWith('otp_verified_')).forEach(k => sessionStorage.removeItem(k));
    } catch { /* silent */ }
    // Capture today's closing snapshot before signing out (best effort)
    try {
      await supabase.rpc('take_stock_snapshot' as any, { p_source: 'logout' });
    } catch {
      // silent
    }
    await clearOfflineDataOnSignOut(state.user?.id ?? null);
    if (navigator.onLine && state.session) await supabase.auth.signOut();
    else setState({ user: null, session: null, role: null, profile: null, loading: false, isIdle: false, otpRequired: false, otpEmailMasked: null });
  };
  signOutRef.current = signOut;



  const changePassword = async (currentPassword: string, newPassword: string): Promise<{ error?: string }> => {
    const userId = state.user?.id;
    const email = state.user?.email;
    if (!userId || !email) return { error: 'Your session has expired. Please sign in again.' };

    passwordChangeInProgressRef.current = true;
    try {
      // Validate the temporary/current password explicitly. This keeps password changes
      // reliable whether or not the hosted auth setting requires the current password.
      const { error: validationError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (validationError) return { error: 'The current password is incorrect.' };

      const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
      if (passwordError) return { error: passwordError.message };

      // Some auth configurations revoke the current session after a password update.
      // Re-authenticate before touching the profile so the user is not sent to login.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email,
          password: newPassword,
        });
        if (reauthError) {
          return { error: 'Password changed successfully. Please sign in with your new password.' };
        }
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('user_id', userId);
      if (profileError) return { error: profileError.message };

      const authorization = await getOfflineAuthorization(userId);
      if (authorization) {
        const passwordData = await createPasswordVerifier(newPassword);
        await saveOfflineAuthorization({
          ...authorization,
          passwordSalt: passwordData.salt,
          passwordVerifier: passwordData.verifier,
        });
      }
      setState(prev => ({
        ...prev,
        profile: prev.profile ? { ...prev.profile, must_change_password: false } : null,
      }));
      return {};
    } finally {
      passwordChangeInProgressRef.current = false;
    }
  };

  const verifyOtp = async (code: string): Promise<{ error?: string }> => {
    const { data, error } = await supabase.functions.invoke('verify-login-otp', { body: { code } });
    if (error) {
      const msg = (data as any)?.error || error.message || 'Verification failed';
      return { error: msg };
    }
    if ((data as any)?.error) return { error: (data as any).error };
    if (state.user) sessionStorage.setItem(`otp_verified_${state.user.id}`, '1');
    setState(prev => ({ ...prev, otpRequired: false }));
    return {};
  };

  const resendOtp = async (): Promise<{ error?: string }> => {
    const { data, error } = await supabase.functions.invoke('send-login-otp');
    if (error) return { error: (data as any)?.error || error.message };
    return {};
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, changePassword, dismissIdle, verifyOtp, resendOtp }}>
      {children}
    </AuthContext.Provider>
  );
}

function maskEmail(email: string): string {
  const [u, d] = email.split('@');
  if (!d) return email;
  const head = u.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(u.length - 2, 1))}@${d}`;
}
