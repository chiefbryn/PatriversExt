import { useState, useMemo } from 'react';
import { Plus, ToggleLeft, ToggleRight, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { ContentSkeleton, InlineSkeleton } from '@/components/LoadingSkeletons';

export default function PaymentTypes() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', description: '', provider: '' });
  const [saving, setSaving] = useState(false);

  const { data: paymentTypes = [], isLoading } = useQuery({
    queryKey: ['payment-types'],
    queryFn: async () => {
      const { data } = await supabase.from('payment_types').select('*').order('name');
      return data || [];
    },
  });

  const handleCreate = async () => {
    if (!form.name.trim() || !form.code.trim()) { toast.error('Name and code are required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('payment_types').insert({
        name: form.name, code: form.code.toUpperCase(),
        description: form.description || null, provider: form.provider || null,
      });
      if (error) throw error;
      toast.success('Payment type added');
      setFormOpen(false);
      setForm({ name: '', code: '', description: '', provider: '' });
      queryClient.invalidateQueries({ queryKey: ['payment-types'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed');
    }
    setSaving(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase.from('payment_types').update({ is_active: !current }).eq('id', id);
      if (error) throw error;
      toast.success(`Payment type ${!current ? 'activated' : 'deactivated'}`);
      queryClient.invalidateQueries({ queryKey: ['payment-types'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Payment types</h1>
        <div className="flex gap-2">
          <RecordsToolbar
            disabled={paymentTypes.length === 0}
            getData={() => ({
              title: 'Payment Types',
              subtitle: `${paymentTypes.length} payment type(s)`,
              filename: 'payment_types',
              headers: ['#', 'Name', 'Code', 'Provider', 'Description', 'Status'],
              rows: paymentTypes.map((pt: any, i) => [
                i + 1, pt.name, pt.code, pt.provider || '—', pt.description || '—',
                pt.is_active ? 'Active' : 'Inactive',
              ]),
            })}
          />
          <Button className="gap-2" onClick={() => setFormOpen(true)}><Plus className="w-4 h-4" /> Add payment type</Button>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-0"><ContentSkeleton rows={5} /></CardContent></Card>
      ) : paymentTypes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            <CreditCard className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            No payment types configured.
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentTypes.map(pt => (
                <TableRow key={pt.id}>
                  <TableCell className="font-medium">{pt.name}</TableCell>
                  <TableCell>{pt.code}</TableCell>
                  <TableCell>{pt.provider || '—'}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{pt.description || '—'}</TableCell>
                  <TableCell><Badge variant={pt.is_active ? 'default' : 'secondary'} className="text-[10px]">{pt.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                  <TableCell>
                    <Switch checked={pt.is_active} onCheckedChange={() => toggleActive(pt.id, pt.is_active)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Payment Type</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bank Transfer" /></div>
            <div><Label>Code *</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. BANK" /></div>
            <div><Label>Provider</Label><Input value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))} placeholder="e.g. MTN" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <Button className="w-full" onClick={handleCreate} disabled={saving}>{saving ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : 'Add Payment Type'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
