import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getOfflineAuthorization, getOfflineMeta, setOfflineMeta } from '@/lib/offlineDb';

export interface Outlet {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useOutlets() {
  return useQuery({
    queryKey: ['outlets'],
    queryFn: async () => {
      if (!navigator.onLine) return (await getOfflineMeta<Outlet[]>('outlets')) || [];
      const { data, error } = await supabase
        .from('outlets' as any)
        .select('*')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      const rows = (data || []) as unknown as Outlet[];
      await setOfflineMeta('outlets', rows);
      return rows;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** The outlet the signed-in staff member is assigned to (null when unassigned). */
export function useMyOutlet() {
  const { user } = useAuth();
  const { data: outlets = [] } = useOutlets();
  const q = useQuery({
    queryKey: ['my-outlet-id', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!navigator.onLine) return (await getOfflineAuthorization(user!.id))?.outletId || null;
      const { data } = await supabase
        .from('profiles')
        .select('outlet_id' as any)
        .eq('user_id', user!.id)
        .maybeSingle();
      return ((data as any)?.outlet_id as string | null) ?? null;
    },
  });
  const outlet = outlets.find(o => o.id === q.data) ?? null;
  return { outletId: q.data ?? null, outlet, loading: q.isLoading };
}
