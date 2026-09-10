import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMyOutlet, useOutlets } from '@/hooks/useOutlets';
import { useBranchStock, branchQty } from '@/hooks/useBranchStock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { TableRowsSkeleton } from '@/components/LoadingSkeletons';

export interface StockTransfer {
  id: string;
  transfer_number: string;
  from_outlet_id: string;
  to_outlet_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  status: 'requested' | 'approved' | 'completed' | 'rejected' | 'cancelled';
  requested_by: string;
  requested_by_name: string | null;
  requested_at: string;
  approved_at: string | null;
  received_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
}

const STATUS_LABEL: Record<StockTransfer['status'], string> = {
  requested: 'Awaiting sender approval',
  approved: 'Approved, awaiting receipt',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_CLASS: Record<StockTransfer['status'], string> = {
  requested: 'text-warning-foreground bg-warning/20',
  approved: 'text-primary bg-primary/10',
  completed: 'text-foreground bg-muted',
  rejected: 'text-destructive bg-destructive/10',
  cancelled: 'text-muted-foreground bg-muted',
};

type Tab = 'open' | 'all';

export default function Transfers() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const { data: outlets = [] } = useOutlets();
  const { outletId: myOutletId } = useMyOutlet();
  const { rows: stockRows } = useBranchStock();
  const isManager = role === 'admin' || role === 'ceo';
  const activeOutlets = outlets.filter(o => o.is_active);
  const outletName = (id: string) => outlets.find(o => o.id === id)?.name ?? 'Unknown branch';

  const [tab, setTab] = useState<Tab>('open');
  const [open, setOpen] = useState(false);
  const [reject, setReject] = useState<{ id: string; action: 'reject' | 'cancel' } | null>(null);
  const [reason, setReason] = useState('');
  const [form, setForm] = useState({ to: '', from: '', productSearch: '', productId: '', quantity: 1, notes: '' });

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['stock-transfers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_transfers' as any).select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as unknown as StockTransfer[];
    },
    refetchInterval: 30_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['stock-transfers'] });
    qc.invalidateQueries({ queryKey: ['branch-stock'] });
  };

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!navigator.onLine) throw new Error('Transfers need a live connection so both branches can agree');
      const { error } = await supabase.rpc('request_stock_transfer' as any, {
        p_product_id: form.productId,
        p_from_outlet_id: form.from,
        p_to_outlet_id: form.to,
        p_quantity: Number(form.quantity),
        p_notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Transfer requested. The sending branch must approve it.');
      setOpen(false);
      setForm({ to: '', from: '', productSearch: '', productId: '', quantity: 1, notes: '' });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, action, why }: { id: string; action: string; why?: string }) => {
      if (!navigator.onLine) throw new Error('Transfers need a live connection so both branches can agree');
      const { error } = await supabase.rpc('respond_stock_transfer' as any, { p_transfer_id: id, p_action: action, p_reason: why || null });
      if (error) throw error;
      return action;
    },
    onSuccess: (action) => {
      const msg: Record<string, string> = {
        approve: 'Approved. Stock moves once the receiving branch confirms.',
        receive: 'Receipt confirmed. Stock has moved between branches.',
        reject: 'Transfer rejected. No stock was moved.',
        cancel: 'Request cancelled. No stock was moved.',
      };
      toast.success(msg[action] || 'Updated');
      setReject(null);
      setReason('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = useMemo(() => transfers.filter(t => tab === 'all' || t.status === 'requested' || t.status === 'approved'), [transfers, tab]);

  const canApprove = (t: StockTransfer) => t.status === 'requested' && (isManager || myOutletId === t.from_outlet_id);
  const canReceive = (t: StockTransfer) => t.status === 'approved' && (isManager || myOutletId === t.to_outlet_id);
  const canCancel = (t: StockTransfer) => (t.status === 'requested' || t.status === 'approved') && (isManager || myOutletId === t.to_outlet_id);
  const canReject = (t: StockTransfer) => (t.status === 'requested' || t.status === 'approved') && (isManager || myOutletId === t.from_outlet_id);

  const productMatches = useMemo(() => {
    const s = form.productSearch.trim().toLowerCase();
    if (!s) return [];
    return stockRows.filter(r => r.name.toLowerCase().includes(s)).slice(0, 8);
  }, [form.productSearch, stockRows]);
  const chosen = stockRows.find(r => r.product_id === form.productId);

  const openDialog = () => {
    setForm(f => ({ ...f, to: isManager ? '' : (myOutletId || '') }));
    setOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Branch transfers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A branch requests stock, the sending branch approves, and the receiving branch confirms arrival. Stock only moves after all three steps.
          </p>
        </div>
        <Button onClick={openDialog} disabled={!isManager && !myOutletId}>Request transfer</Button>
      </div>

      {!isManager && !myOutletId && (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Your account is not assigned to a branch, so you cannot request or approve transfers.</CardContent></Card>
      )}

      <div className="flex items-center gap-3">
        <div className="flex border">
          {(['open', 'all'] as Tab[]).map(v => (
            <button key={v} onClick={() => setTab(v)} className={cn('px-3 py-1.5 text-xs font-medium border-r last:border-r-0', tab === v ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/50')}>
              {v === 'open' ? 'Open' : 'All'}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{visible.length} transfers</span>
      </div>

      <div className="border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Drug</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRowsSkeleton columns={8} />}
            {!isLoading && visible.length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No transfers to show</TableCell></TableRow>}
            {visible.map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs">{t.transfer_number}</TableCell>
                <TableCell>
                  <div className="font-medium">{t.product_name}</div>
                  {t.notes && <div className="text-xs text-muted-foreground">{t.notes}</div>}
                  {t.rejection_reason && <div className="text-xs text-destructive">{t.rejection_reason}</div>}
                </TableCell>
                <TableCell className="text-right font-semibold">{t.quantity}</TableCell>
                <TableCell>{outletName(t.from_outlet_id)}</TableCell>
                <TableCell>{outletName(t.to_outlet_id)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>{format(new Date(t.requested_at), 'dd/MM/yyyy HH:mm')}</div>
                  <div>{t.requested_by_name || ''}</div>
                </TableCell>
                <TableCell><span className={cn('px-2 py-0.5 text-xs font-medium', STATUS_CLASS[t.status])}>{STATUS_LABEL[t.status]}</span></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canApprove(t) && <Button size="sm" className="h-7 text-xs" disabled={respondMutation.isPending} onClick={() => respondMutation.mutate({ id: t.id, action: 'approve' })}>Approve</Button>}
                    {canReceive(t) && <Button size="sm" className="h-7 text-xs" disabled={respondMutation.isPending} onClick={() => respondMutation.mutate({ id: t.id, action: 'receive' })}>Confirm receipt</Button>}
                    {canReject(t) && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReject({ id: t.id, action: 'reject' })}>Reject</Button>}
                    {canCancel(t) && !canReject(t) && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReject({ id: t.id, action: 'cancel' })}>Cancel</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Request a transfer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Receiving branch</Label>
                <Select value={form.to} onValueChange={v => setForm(f => ({ ...f, to: v }))} disabled={!isManager}>
                  <SelectTrigger><span>{form.to ? outletName(form.to) : 'Choose'}</span></SelectTrigger>
                  <SelectContent>{activeOutlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sending branch</Label>
                <Select value={form.from} onValueChange={v => setForm(f => ({ ...f, from: v }))}>
                  <SelectTrigger><span>{form.from ? outletName(form.from) : 'Choose'}</span></SelectTrigger>
                  <SelectContent>{activeOutlets.filter(o => o.id !== form.to).map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Drug</Label>
              {chosen ? (
                <div className="flex items-center justify-between border px-3 py-2 text-sm">
                  <span>{chosen.name}</span>
                  <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setForm(f => ({ ...f, productId: '', productSearch: '' }))}>Change</button>
                </div>
              ) : (
                <>
                  <Input placeholder="Search by name" value={form.productSearch} onChange={e => setForm(f => ({ ...f, productSearch: e.target.value }))} />
                  {productMatches.length > 0 && (
                    <div className="border divide-y max-h-48 overflow-y-auto">
                      {productMatches.map(r => (
                        <button key={r.product_id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between" onClick={() => setForm(f => ({ ...f, productId: r.product_id, productSearch: r.name }))}>
                          <span>{r.name}</span>
                          {form.from && <span className="text-xs text-muted-foreground">{branchQty(r, form.from)} at sender</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {chosen && form.from && (
                <p className="text-xs text-muted-foreground">Sending branch has {branchQty(chosen, form.from)} {chosen.uom}. Receiving branch has {form.to ? branchQty(chosen, form.to) : 0}.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button disabled={!form.to || !form.from || !form.productId || form.quantity < 1 || requestMutation.isPending} onClick={() => requestMutation.mutate()}>Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reject} onOpenChange={o => { if (!o) { setReject(null); setReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{reject?.action === 'cancel' ? 'Cancel this request' : 'Reject this transfer'}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">No stock will move. You can add a short reason for the other branch.</p>
          <Textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReject(null); setReason(''); }}>Back</Button>
            <Button variant="destructive" disabled={respondMutation.isPending} onClick={() => reject && respondMutation.mutate({ id: reject.id, action: reject.action, why: reason })}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
