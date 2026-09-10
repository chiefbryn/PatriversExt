import { useState } from 'react';
import { Plus, Pencil, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useOutlets, type Outlet } from '@/hooks/useOutlets';
import { useConnectivity } from '@/hooks/useConnectivity';
import { InlineSkeleton, TableRowsSkeleton } from '@/components/LoadingSkeletons';

const EMPTY = { name: '', code: '', address: '', phone: '' };

interface StaffRow { id: string; user_id: string; full_name: string; email: string; outlet_id: string | null; status: string }

export default function Outlets() {
  const qc = useQueryClient();
  const { online } = useConnectivity();
  const { data: outlets = [], isLoading } = useOutlets();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Outlet | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data: unassigned } = useQuery({
    queryKey: ['unassigned-records'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('count_unassigned_records' as any);
      if (error) throw error;
      return data as Record<string, number>;
    },
  });

  const { data: staff = [] } = useQuery({
    queryKey: ['staff-outlets'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, user_id, full_name, email, outlet_id, status' as any).order('full_name');
      return (data || []) as unknown as StaffRow[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['outlets'] });
    qc.invalidateQueries({ queryKey: ['unassigned-records'] });
    qc.invalidateQueries({ queryKey: ['staff-outlets'] });
    qc.invalidateQueries({ queryKey: ['my-outlet-id'] });
  };

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (o: Outlet) => {
    setEditing(o);
    setForm({ name: o.name, code: o.code, address: o.address || '', phone: o.phone || '' });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) { toast.error('Name and code are required'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
    };
    const isFirst = outlets.length === 0 && !editing;
    const { error } = editing
      ? await supabase.from('outlets' as any).update(payload).eq('id', editing.id)
      : await supabase.from('outlets' as any).insert({ ...payload, sort_order: outlets.length });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? 'Outlet updated' : isFirst ? 'Outlet created — existing records assigned to it' : 'Outlet created');
    setOpen(false);
    refresh();
  };

  const toggleActive = async (o: Outlet) => {
    const { error } = await supabase.from('outlets' as any).update({ is_active: !o.is_active }).eq('id', o.id);
    if (error) toast.error(error.message); else refresh();
  };

  const assignAll = async (outletId: string) => {
    const { data, error } = await supabase.rpc('assign_unassigned_to_outlet' as any, { p_outlet_id: outletId });
    if (error) { toast.error(error.message); return; }
    const r = data as Record<string, number>;
    toast.success(`Assigned: ${r.sales} sales, ${r.documents} documents, ${r.stock_movements} stock movements, ${r.profiles} staff`);
    refresh();
  };

  const setStaffOutlet = async (userId: string, outletId: string | null) => {
    const { error } = await supabase.from('profiles').update({ outlet_id: outletId } as any).eq('user_id', userId);
    if (error) toast.error(error.message); else { toast.success('Staff outlet updated'); refresh(); }
  };

  const totalUnassigned = unassigned
    ? Object.entries(unassigned).filter(([k]) => k !== 'products_without_outlet_stock').reduce((s, [, v]) => s + Number(v), 0)
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Outlets</h1>
          <p className="text-sm text-muted-foreground">Set up the Patrivers Pharmacy shops. Each device, staff member, sale and stock movement is tied to an outlet.</p>
        </div>
        <Button onClick={openNew} className="gap-2" disabled={!online} title={online ? 'Add outlet' : 'Internet connection required'}><Plus className="w-4 h-4" /> Add outlet</Button>
      </div>

      {outlets.length === 0 && !isLoading && (
        <Card className="border-accent/40">
          <CardContent className="py-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">No outlets yet</p>
              <p className="text-muted-foreground">The first outlet you create will automatically take over all existing sales, stock, documents and staff records. Create the main branch first.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {unassigned && outlets.length > 0 && (
        <Card>
          <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap text-sm">
            {totalUnassigned === 0 ? (
              <span className="flex items-center gap-2 text-primary"><CheckCircle2 className="w-4 h-4" /> All records are assigned to an outlet.</span>
            ) : (
              <>
                <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-accent" />
                  {totalUnassigned} records still need an outlet
                  <span className="text-muted-foreground">({unassigned.sales} sales, {unassigned.documents} documents, {unassigned.stock_movements} movements, {unassigned.requisitions} requisitions, {unassigned.profiles} staff)</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Assign them to</span>
                  {outlets.filter(o => o.is_active).map(o => (
                    <Button key={o.id} size="sm" variant="outline" onClick={() => assignAll(o.id)}>{o.name}</Button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRowsSkeleton columns={6} />}
              {!isLoading && outlets.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No outlets created</TableCell></TableRow>}
              {outlets.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell><Badge variant="outline">{o.code}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{o.address || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{o.phone || '—'}</TableCell>
                  <TableCell><Switch checked={o.is_active} onCheckedChange={() => toggleActive(o)} /></TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => openEdit(o)}><Pencil className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {outlets.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Staff assignment</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Staff</TableHead><TableHead>Email</TableHead><TableHead className="w-56">Outlet</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {staff.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.full_name}{s.status !== 'active' && <Badge variant="secondary" className="ml-2">{s.status}</Badge>}</TableCell>
                    <TableCell className="text-muted-foreground">{s.email}</TableCell>
                    <TableCell>
                      <Select value={s.outlet_id ?? 'none'} onValueChange={v => setStaffOutlet(s.user_id, v === 'none' ? null : v)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit outlet' : 'New outlet'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Outlet name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Main branch" /></div>
            <div><Label>Short code</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. MAIN" maxLength={8} /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? <InlineSkeleton className="h-4 w-14 bg-primary-foreground/30" /> : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
