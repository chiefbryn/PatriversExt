import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOutlets } from '@/hooks/useOutlets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TableRowsSkeleton } from '@/components/LoadingSkeletons';
import { cn } from '@/lib/utils';

type Status = 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';

interface StockCount {
  id: string;
  count_number: string;
  outlet_id: string;
  scope: 'full' | 'partial';
  status: Status;
  notes: string | null;
  counted_by_name: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  item_count: number;
  variance_count: number;
  created_at: string;
}

interface CountItem {
  id: string;
  product_id: string;
  product_name: string;
  system_qty: number;
  counted_qty: number | null;
  variance: number;
}

const STATUS_LABEL: Record<Status, string> = {
  draft: 'Counting',
  submitted: 'Awaiting approval',
  approved: 'Approved, stock updated',
  rejected: 'Rejected, stock unchanged',
  cancelled: 'Cancelled',
};

const STATUS_CLASS: Record<Status, string> = {
  draft: 'bg-muted text-foreground',
  submitted: 'bg-warning/20 text-warning-foreground',
  approved: 'bg-primary/10 text-primary',
  rejected: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
};

export default function StockCount() {
  const qc = useQueryClient();
  const { data: outlets = [] } = useOutlets();
  const activeOutlets = outlets.filter(o => o.is_active);
  const outletName = (id: string) => outlets.find(o => o.id === id)?.name ?? 'Unknown branch';

  const [openSheetId, setOpenSheetId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [reject, setReject] = useState<{ id: string; action: 'reject' | 'cancel' } | null>(null);
  const [reason, setReason] = useState('');
  const [form, setForm] = useState<{ outlet: string; scope: 'full' | 'partial'; search: string; picked: string[]; notes: string }>({
    outlet: '', scope: 'full', search: '', picked: [], notes: '',
  });
  const [shelf, setShelf] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');

  const { data: counts = [], isLoading } = useQuery({
    queryKey: ['stock-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_counts' as any).select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data || []) as unknown as StockCount[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['stock-count-products'],
    enabled: newOpen,
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name, uom').neq('status', 'deleted').order('name').limit(2000);
      if (error) throw error;
      return (data || []) as { id: string; name: string; uom: string }[];
    },
  });

  const sheet = counts.find(c => c.id === openSheetId) || null;

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['stock-count-items', openSheetId],
    enabled: !!openSheetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_count_items' as any)
        .select('id, product_id, product_name, system_qty, counted_qty, variance')
        .eq('count_id', openSheetId)
        .order('product_name')
        .limit(3000);
      if (error) throw error;
      return (data || []) as unknown as CountItem[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['stock-counts'] });
    qc.invalidateQueries({ queryKey: ['stock-count-items'] });
    qc.invalidateQueries({ queryKey: ['branch-stock'] });
    qc.invalidateQueries({ queryKey: ['products'] });
  };

  const createCount = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_stock_count' as any, {
        p_outlet_id: form.outlet,
        p_scope: form.scope,
        p_product_ids: form.scope === 'partial' ? form.picked : null,
        p_notes: form.notes || null,
      });
      if (error) throw error;
      return data as { id: string; count_number: string };
    },
    onSuccess: (data) => {
      toast.success(`Count sheet ${data.count_number} ready`);
      setNewOpen(false);
      setForm({ outlet: '', scope: 'full', search: '', picked: [], notes: '' });
      qc.invalidateQueries({ queryKey: ['stock-counts'] });
      setShelf({});
      setOpenSheetId(data.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveShelf = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(shelf).filter(([, v]) => v !== '');
      if (entries.length === 0) throw new Error('Enter at least one shelf quantity');
      for (const [itemId, value] of entries) {
        const item = items.find(i => i.id === itemId);
        if (!item) continue;
        const counted = Math.max(0, Math.floor(Number(value)));
        const { error } = await supabase
          .from('stock_count_items' as any)
          .update({ counted_qty: counted, variance: counted - item.system_qty } as any)
          .eq('id', itemId);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success('Shelf quantities saved'); setShelf({}); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitCount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('submit_stock_count' as any, { p_count_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Sent for approval. Stock is unchanged until it is approved.'); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const respond = useMutation({
    mutationFn: async ({ id, action, why }: { id: string; action: string; why?: string }) => {
      const { data, error } = await supabase.rpc('respond_stock_count' as any, { p_count_id: id, p_action: action, p_reason: why || null });
      if (error) throw error;
      return { action, result: data as { adjusted: number } };
    },
    onSuccess: ({ action, result }) => {
      if (action === 'approve') toast.success(`Approved. ${result?.adjusted ?? 0} items adjusted to the counted amounts.`);
      else if (action === 'reject') toast.success('Rejected. No stock was changed.');
      else toast.success('Cancelled. No stock was changed.');
      setReject(null);
      setReason('');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const matches = useMemo(() => {
    const s = form.search.trim().toLowerCase();
    if (!s) return [];
    return products.filter(p => p.name.toLowerCase().includes(s) && !form.picked.includes(p.id)).slice(0, 8);
  }, [form.search, form.picked, products]);

  const visibleItems = useMemo(() => {
    const s = filter.trim().toLowerCase();
    return s ? items.filter(i => i.product_name.toLowerCase().includes(s)) : items;
  }, [items, filter]);

  const countedSoFar = items.filter(i => i.counted_qty !== null).length;
  const varianceSoFar = items.filter(i => i.counted_qty !== null && i.counted_qty !== i.system_qty).length;

  if (sheet) {
    const editable = sheet.status === 'draft';
    return (
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <button className="text-xs text-muted-foreground underline" onClick={() => { setOpenSheetId(null); setShelf({}); setFilter(''); }}>Back to stock control</button>
            <h1 className="text-2xl font-semibold tracking-tight mt-2">{sheet.count_number}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {outletName(sheet.outlet_id)}. {sheet.scope === 'full' ? 'Whole branch' : 'Selected items'}. {STATUS_LABEL[sheet.status]}.
            </p>
          </div>
          <div className="flex gap-2">
            {editable && <Button variant="outline" disabled={saveShelf.isPending} onClick={() => saveShelf.mutate()}>Save counts</Button>}
            {editable && <Button disabled={submitCount.isPending || countedSoFar === 0} onClick={() => submitCount.mutate(sheet.id)}>Send for approval</Button>}
            {sheet.status === 'submitted' && (
              <>
                <Button variant="outline" onClick={() => setReject({ id: sheet.id, action: 'reject' })}>Reject</Button>
                <Button disabled={respond.isPending} onClick={() => respond.mutate({ id: sheet.id, action: 'approve' })}>Approve and adjust</Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border divide-x bg-card">
          {[
            ['Items on sheet', items.length],
            ['Counted', countedSoFar],
            ['Differences', varianceSoFar],
            ['Not yet counted', items.length - countedSoFar],
          ].map(([label, value]) => (
            <div key={label as string} className="px-4 py-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        <Input placeholder="Filter items by name" value={filter} onChange={e => setFilter(e.target.value)} className="max-w-sm" />

        <div className="border overflow-x-auto bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drug</TableHead>
                <TableHead className="text-right">On system</TableHead>
                <TableHead className="text-right w-40">On the shelf</TableHead>
                <TableHead className="text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemsLoading && <TableRowsSkeleton columns={4} rows={8} />}
              {!itemsLoading && visibleItems.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No items match this filter</TableCell></TableRow>
              )}
              {visibleItems.map(item => {
                const entered = shelf[item.id];
                const shown = entered !== undefined ? entered : (item.counted_qty === null ? '' : String(item.counted_qty));
                const diff = shown === '' ? null : Math.max(0, Math.floor(Number(shown))) - item.system_qty;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.product_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.system_qty}</TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="h-8 w-28 ml-auto text-right"
                          value={shown}
                          onChange={e => setShelf(s => ({ ...s, [item.id]: e.target.value }))}
                        />
                      ) : (
                        <span className="tabular-nums">{item.counted_qty === null ? 'Not counted' : item.counted_qty}</span>
                      )}
                    </TableCell>
                    <TableCell className={cn('text-right tabular-nums font-medium', diff && diff !== 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {diff === null ? '' : diff > 0 ? `+${diff}` : diff}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <Dialog open={!!reject} onOpenChange={o => { if (!o) { setReject(null); setReason(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Reject this count</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Stock stays exactly as it is. You can add a short reason.</p>
            <Textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setReject(null); setReason(''); }}>Back</Button>
              <Button variant="destructive" disabled={respond.isPending} onClick={() => reject && respond.mutate({ id: reject.id, action: reject.action, why: reason })}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock control</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Check what the system holds against what is actually on the shelves. Enter the shelf quantity beside each drug, send the sheet for approval, and stock only changes once it is approved.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)} disabled={activeOutlets.length === 0}>New stock check</Button>
      </div>

      {activeOutlets.length === 0 && (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Add a branch first, then you can start a stock check.</CardContent></Card>
      )}

      <div className="border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Coverage</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Differences</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRowsSkeleton columns={8} />}
            {!isLoading && counts.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No stock checks yet</TableCell></TableRow>
            )}
            {counts.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.count_number}</TableCell>
                <TableCell>{outletName(c.outlet_id)}</TableCell>
                <TableCell className="text-sm">{c.scope === 'full' ? 'Whole branch' : 'Selected items'}</TableCell>
                <TableCell className="text-right tabular-nums">{c.item_count}</TableCell>
                <TableCell className="text-right tabular-nums">{c.status === 'draft' ? '' : c.variance_count}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <div>{format(new Date(c.created_at), 'dd/MM/yyyy HH:mm')}</div>
                  <div>{c.counted_by_name || ''}</div>
                </TableCell>
                <TableCell>
                  <span className={cn('px-2 py-0.5 text-xs font-medium', STATUS_CLASS[c.status])}>{STATUS_LABEL[c.status]}</span>
                  {c.rejection_reason && <div className="text-xs text-destructive mt-1">{c.rejection_reason}</div>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setShelf({}); setFilter(''); setOpenSheetId(c.id); }}>
                      {c.status === 'draft' ? 'Continue' : 'Open'}
                    </Button>
                    {(c.status === 'draft' || c.status === 'submitted') && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReject({ id: c.id, action: 'cancel' })}>Cancel</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Start a stock check</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={form.outlet} onValueChange={v => setForm(f => ({ ...f, outlet: v }))}>
                <SelectTrigger><span>{form.outlet ? outletName(form.outlet) : 'Choose branch'}</span></SelectTrigger>
                <SelectContent>{activeOutlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Coverage</Label>
              <div className="flex border">
                {(['full', 'partial'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, scope: v }))}
                    className={cn('flex-1 px-3 py-2 text-xs font-medium border-r last:border-r-0', form.scope === v ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/50')}
                  >
                    {v === 'full' ? 'Whole branch' : 'Selected items'}
                  </button>
                ))}
              </div>
            </div>

            {form.scope === 'partial' && (
              <div className="space-y-1.5">
                <Label>Items to count</Label>
                <Input placeholder="Search by name" value={form.search} onChange={e => setForm(f => ({ ...f, search: e.target.value }))} />
                {matches.length > 0 && (
                  <div className="border divide-y max-h-40 overflow-y-auto">
                    {matches.map(p => (
                      <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                        onClick={() => setForm(f => ({ ...f, picked: [...f.picked, p.id], search: '' }))}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                {form.picked.length > 0 && (
                  <div className="border divide-y">
                    {form.picked.map(id => (
                      <div key={id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                        <span>{products.find(p => p.id === id)?.name ?? id}</span>
                        <button type="button" className="text-xs text-muted-foreground underline"
                          onClick={() => setForm(f => ({ ...f, picked: f.picked.filter(x => x !== id) }))}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Close</Button>
            <Button
              disabled={!form.outlet || (form.scope === 'partial' && form.picked.length === 0) || createCount.isPending}
              onClick={() => createCount.mutate()}
            >
              Create sheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reject} onOpenChange={o => { if (!o) { setReject(null); setReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cancel this stock check</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Nothing on the sheet will change stock levels.</p>
          <Textarea rows={2} placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReject(null); setReason(''); }}>Back</Button>
            <Button variant="destructive" disabled={respond.isPending} onClick={() => reject && respond.mutate({ id: reject.id, action: 'cancel', why: reason })}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
