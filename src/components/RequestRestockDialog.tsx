import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InlineSkeleton } from '@/components/LoadingSkeletons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { enqueueOffline, getDeviceKey, getOfflineAuthorization } from '@/lib/offlineDb';

export const LOW_STOCK_THRESHOLD = 15;

export const REQUEST_REASONS = [
  { value: 'low_stock', label: 'Low stock, about to run out' },
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'high_demand', label: 'High customer demand' },
  { value: 'customer_request', label: 'Specific customer request' },
  { value: 'expired_damaged', label: 'Replace expired/damaged stock' },
  { value: 'restock', label: 'Routine restock' },
];

interface RequestProduct {
  name: string;
  qty: number;
  uom: string;
  /** Branch the reorder is for. When set, the requisition is filed against that branch. */
  outletId?: string;
  outletName?: string;
}

interface Props {
  product: RequestProduct | null;
  onClose: () => void;
}

export function RequestRestockDialog({ product, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reason, setReason] = useState('low_stock');
  const [qty, setQty] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  const createReq = useMutation({
    mutationFn: async () => {
      if (!product || !user) throw new Error('Missing data');
      const reasonLabel = REQUEST_REASONS.find(r => r.value === reason)?.label || reason;
      const urgency = product.qty === 0 ? 'high' : product.qty < 5 ? 'high' : 'medium';
      const branchNote = product.outletName ? ` Branch: ${product.outletName}.` : '';
      const finalNotes = `Reason: ${reasonLabel}.${branchNote} Current stock: ${product.qty} ${product.uom}.${notes ? ' ' + notes : ''}`;
      const clientId = crypto.randomUUID();
      if (!navigator.onLine) {
        const auth = await getOfflineAuthorization(user.id);
        const outletId = product.outletId || auth?.outletId;
        if (!outletId) throw new Error('No outlet is assigned to this device');
        const createdAt = new Date().toISOString();
        const payload = { id: clientId, client_id: clientId, user_id: user.id, outlet_id: outletId, product_name: product.name, quantity_needed: typeof qty === 'number' ? qty : 0, urgency, notes: finalNotes, status: 'pending', created_at: createdAt, updated_at: createdAt };
        await enqueueOffline({ id: clientId, kind: 'requisition', userId: user.id, outletId, deviceKey: auth?.deviceKey || getDeviceKey(user.id), createdAt, payload });
        window.dispatchEvent(new CustomEvent('patrivers-sync-change'));
        return;
      }
      const { error } = await supabase.from('requisitions').insert({
        user_id: user.id,
        product_name: product.name,
        quantity_needed: typeof qty === 'number' ? qty : 0,
        urgency,
        notes: finalNotes,
        client_id: clientId,
        ...(product.outletId ? { outlet_id: product.outletId } : {}),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success('Requisition submitted');
      setNotes('');
      setReason('low_stock');
      setQty('');
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Restock</DialogTitle>
        </DialogHeader>
        {product && (
          <div className="space-y-3">
            <div className="bg-muted/40 rounded-md p-3 text-sm">
              <div className="font-medium">{product.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {product.outletName ? `${product.outletName}: ` : 'Current stock: '}
                <span className="text-destructive font-semibold">{product.qty} {product.uom}</span>
              </div>
            </div>
            <div>
              <Label>Reason for request *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REQUEST_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity needed</Label>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={e => setQty(e.target.value === '' ? '' : parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <Label>Additional notes (optional)</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any extra details..."
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button
                className="flex-1"
                disabled={createReq.isPending || qty === ''}
                onClick={() => createReq.mutate()}
              >
                {createReq.isPending ? <InlineSkeleton className="h-4 w-24 bg-primary-foreground/30" /> : 'Submit Request'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
