import { FileText, CreditCard, CheckCircle2, XCircle, PenLine, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDocumentAuditLog } from '@/hooks/useDocuments';
import { ContentSkeleton } from '@/components/LoadingSkeletons';

const ACTION_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  document_created: { icon: Plus, color: 'text-accent', label: 'Created' },
  document_updated: { icon: PenLine, color: 'text-blue-500', label: 'Updated' },
  document_confirmed: { icon: CheckCircle2, color: 'text-blue-600', label: 'Confirmed' },
  document_cancelled: { icon: XCircle, color: 'text-destructive', label: 'Cancelled' },
  document_status_changed: { icon: FileText, color: 'text-muted-foreground', label: 'Status Changed' },
  payment_added: { icon: CreditCard, color: 'text-accent', label: 'Payment Added' },
  payment_updated: { icon: CreditCard, color: 'text-yellow-600', label: 'Payment Updated' },
};

interface Props {
  documentId: string;
}

export function AuditLogViewer({ documentId }: Props) {
  const { data: logs = [], isLoading } = useDocumentAuditLog(documentId);

  if (isLoading) return <Card><CardContent className="p-0"><ContentSkeleton rows={4} /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No activity recorded</p>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-4">
              {logs.map((entry, idx) => {
                const config = ACTION_CONFIG[entry.action] || { icon: FileText, color: 'text-muted-foreground', label: entry.action };
                const Icon = config.icon;
                const changes = entry.old_values?.changes;

                return (
                  <div key={entry.id} className="relative pl-10">
                    {/* Dot */}
                    <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 border-background ${config.color} bg-current`} />

                    <div className="bg-muted/30 rounded-md p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-3.5 h-3.5 ${config.color} shrink-0`} />
                          <span className="text-sm font-medium">{config.label}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(entry.created_at).toLocaleString('en-GB')}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground mt-1">
                        by {entry.performed_by_name || 'System'}
                      </p>

                      {/* Show changes */}
                      {changes && typeof changes === 'object' && (
                        <div className="mt-2 space-y-1">
                          {Object.entries(changes).map(([field, change]: [string, any]) => (
                            <div key={field} className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-[9px] font-mono">{field}</Badge>
                              <span className="text-muted-foreground line-through">{String(change.from ?? '—')}</span>
                              <span>→</span>
                              <span className="font-medium">{String(change.to ?? '—')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
