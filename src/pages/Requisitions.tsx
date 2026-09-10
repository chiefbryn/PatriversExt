import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { ContentSkeleton, InlineSkeleton } from '@/components/LoadingSkeletons';
import { enqueueOffline, getDeviceKey, getOfflineAuthorization } from '@/lib/offlineDb';

const URGENCY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-destructive/10 text-destructive',
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode }> = {
  pending: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: <Clock className="w-3 h-3" /> },
  approved: { color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle className="w-3 h-3" /> },
  rejected: { color: 'bg-destructive/10 text-destructive', icon: <XCircle className="w-3 h-3" /> },
  fulfilled: { color: 'bg-primary/10 text-primary', icon: <CheckCircle className="w-3 h-3" /> },
};

export default function Requisitions() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [form, setForm] = useState({ product_name: '', quantity_needed: 1, urgency: 'medium', notes: '' });

  const { data: requisitions = [], isLoading } = useQuery({
    queryKey: ['requisitions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('requisitions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-map'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, full_name');
      return data || [];
    },
  });

  const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.full_name]));

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Sign in is required');
      const clientId = crypto.randomUUID();
      if (!navigator.onLine) {
        const auth = await getOfflineAuthorization(user.id);
        if (!auth?.outletId) throw new Error('No outlet is assigned to this device');
        const createdAt = new Date().toISOString();
        const payload = { id: clientId, client_id: clientId, user_id: user.id, outlet_id: auth.outletId, product_name: form.product_name, quantity_needed: form.quantity_needed, urgency: form.urgency, notes: form.notes || null, status: 'pending', created_at: createdAt, updated_at: createdAt };
        await enqueueOffline({ id: clientId, kind: 'requisition', userId: user.id, outletId: auth.outletId, deviceKey: auth.deviceKey || getDeviceKey(user.id), createdAt, payload });
        window.dispatchEvent(new CustomEvent('patrivers-sync-change'));
        return { offline: true };
      }
      const { error } = await supabase.from('requisitions').insert({
        user_id: user.id,
        client_id: clientId,
        product_name: form.product_name,
        quantity_needed: form.quantity_needed,
        urgency: form.urgency,
        notes: form.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success(navigator.onLine ? 'Requisition submitted' : 'Saved on this device. It will sync automatically.');
      setForm({ product_name: '', quantity_needed: 1, urgency: 'medium', notes: '' });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('requisitions')
        .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success('Status updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('requisitions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success('Requisition deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('requisitions').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success(`${ids.length} requisition(s) deleted`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const canReview = role === 'admin' || role === 'pharmacist';
  const canDelete = role === 'admin' || role === 'ceo';

  const filtered = requisitions.filter((r: any) => {
    const matchSearch = r.product_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Requisitions</h1>
          <p className="text-sm text-muted-foreground">Request items needed in the shop</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RecordsToolbar
            disabled={filtered.length === 0}
            getData={() => ({
              title: 'Requisitions Report',
              subtitle: `${filtered.length} request(s)`,
              filename: 'requisitions',
              headers: ['#', 'Item', 'Qty', 'Urgency', 'Requested By', 'Date', 'Status', 'Notes'],
              rows: filtered.map((r: any, i: number) => [
                i + 1, r.product_name, r.quantity_needed, r.urgency,
                profileMap[r.user_id] || 'Unknown',
                format(new Date(r.created_at), 'dd MMM yyyy'), r.status, r.notes || '',
              ]),
            })}
          />
          {canDelete && filtered.length > 0 && (
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteAllMutation.isPending}
              onClick={() => {
                const ids = filtered.map((r: any) => r.id);
                if (confirm(`Delete ${ids.length} requisition(s)? This cannot be undone.`)) {
                  deleteAllMutation.mutate(ids);
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-1" /> Delete All
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New Request</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request Item</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Product / Item Name *</Label>
                <Input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} placeholder="e.g. Paracetamol 500mg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantity Needed</Label>
                  <Input type="number" min={1} value={form.quantity_needed} onChange={e => setForm(f => ({ ...f, quantity_needed: parseInt(e.target.value) || 1 }))} />
                </div>
                <div>
                  <Label>Urgency</Label>
                  <Select value={form.urgency} onValueChange={v => setForm(f => ({ ...f, urgency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Why is this item needed?" rows={3} />
              </div>
              <Button className="w-full" disabled={!form.product_name.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? <InlineSkeleton className="h-4 w-24 bg-primary-foreground/30" /> : 'Submit Request'}
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search items..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="fulfilled">Fulfilled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <ContentSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No requisitions found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  {(canReview || canDelete) && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r: any) => {
                  const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{r.product_name}</span>
                          {r.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.notes}</p>}
                        </div>
                      </TableCell>
                      <TableCell>{r.quantity_needed}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={URGENCY_COLORS[r.urgency]}>{r.urgency}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{profileMap[r.user_id] || 'Unknown'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(r.created_at), 'dd MMM yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${sc.color} flex items-center gap-1 w-fit`}>
                          {sc.icon} {r.status}
                        </Badge>
                      </TableCell>
                      {(canReview || canDelete) && (
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {canReview && r.status === 'pending' && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 text-green-600" onClick={() => updateStatus.mutate({ id: r.id, status: 'approved' })}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => updateStatus.mutate({ id: r.id, status: 'rejected' })}>
                                  Reject
                                </Button>
                              </>
                            )}
                            {canReview && r.status === 'approved' && (
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => updateStatus.mutate({ id: r.id, status: 'fulfilled' })}>
                                Mark Fulfilled
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-destructive"
                                onClick={() => {
                                  if (confirm(`Delete requisition for "${r.product_name}"?`)) {
                                    deleteMutation.mutate(r.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
