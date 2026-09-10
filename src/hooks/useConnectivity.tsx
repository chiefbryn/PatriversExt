import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getOfflineMeta, getQueueItems } from '@/lib/offlineDb';
import { syncPendingTransactions } from '@/lib/offlineSync';

interface ConnectivityState {
  online: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
  syncing: boolean;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
}

const ConnectivityContext = createContext<ConnectivityState | null>(null);

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const [items, lastSync] = await Promise.all([getQueueItems(), getOfflineMeta<string>('last_sync_at')]);
    setPendingCount(items.length);
    setFailedCount(items.filter(item => item.status === 'failed').length);
    setLastSyncAt(lastSync || null);
  }, []);

  const retry = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try { await syncPendingTransactions(); } finally { setSyncing(false); await refresh(); }
  }, [refresh]);

  useEffect(() => {
    const handleOnline = () => { setOnline(true); void retry(); };
    const handleOffline = () => setOnline(false);
    const handleChange = () => void refresh();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('patrivers-sync-change', handleChange);
    void refresh();
    if (navigator.onLine) void retry();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('patrivers-sync-change', handleChange);
    };
  }, [refresh, retry]);

  return <ConnectivityContext.Provider value={{ online, pendingCount, failedCount, lastSyncAt, syncing, retry, refresh }}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity() {
  const context = useContext(ConnectivityContext);
  if (!context) throw new Error('useConnectivity must be used within ConnectivityProvider');
  return context;
}