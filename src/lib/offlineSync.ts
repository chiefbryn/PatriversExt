import { supabase } from '@/integrations/supabase/client';
import { getOfflineAuthorization, getQueueItems, removeQueueItem, setOfflineMeta, updateQueueItem, type OfflineQueueItem } from './offlineDb';

let activeSync: Promise<{ synced: number; failed: number }> | null = null;

async function sendItem(item: OfflineQueueItem) {
  if (item.kind === 'sale') {
    const { error } = await supabase.rpc('process_sale', item.payload as never);
    if (error) throw error;
    return;
  }
  if (item.kind === 'requisition') {
    const { error } = await supabase.from('requisitions').upsert(item.payload as never, { onConflict: 'client_id', ignoreDuplicates: true });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.rpc('sync_offline_document' as never, item.payload as never);
  if (error) throw error;
}

export function syncPendingTransactions() {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    if (!navigator.onLine) return { synced: 0, failed: 0 };
    let synced = 0;
    let failed = 0;
    const items = (await getQueueItems()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const item of items) {
      const syncing = { ...item, status: 'syncing' as const, attempts: item.attempts + 1, lastError: undefined };
      await updateQueueItem(syncing);
      try {
        await sendItem(syncing);
        await removeQueueItem(item.id);
        synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Synchronization failed';
        await updateQueueItem({ ...syncing, status: 'failed', lastError: message });
        failed += 1;
      }
    }
    if (synced > 0) {
      const syncedAt = new Date().toISOString();
      await setOfflineMeta('last_sync_at', syncedAt);
      try {
        const authorization = await getOfflineAuthorization();
        if (authorization?.deviceKey) {
          await supabase.rpc('mark_device_synced' as never, { p_device_key: authorization.deviceKey } as never);
        }
      } catch {
        // A successful queue flush remains valid if the heartbeat cannot be recorded.
      }
    }
    window.dispatchEvent(new CustomEvent('patrivers-sync-change'));
    return { synced, failed };
  })().finally(() => { activeSync = null; });
  return activeSync;
}