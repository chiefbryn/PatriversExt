import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useConnectivity } from '@/hooks/useConnectivity';

export function SyncStatus() {
  const { online, pendingCount, failedCount, lastSyncAt, syncing, retry } = useConnectivity();
  const lastSync = lastSyncAt ? new Date(lastSyncAt).toLocaleString('en-GB') : 'Not yet';
  return (
    <div className="hidden md:flex items-center gap-3 border-r pr-3 mr-2 text-xs" aria-live="polite">
      <span className={online ? 'text-success' : 'text-warning'}>{online ? 'Online' : 'Offline'}</span>
      <span className="text-muted-foreground">Pending {pendingCount}</span>
      {failedCount > 0 && <span className="text-destructive">Failed {failedCount}</span>}
      <span className="text-muted-foreground" title={lastSync}>Last sync {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'not yet'}</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void retry()} disabled={!online || syncing} title="Retry synchronization" aria-label="Retry synchronization">
        {syncing ? <Skeleton className="h-3.5 w-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
}