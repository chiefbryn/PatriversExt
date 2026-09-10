import { useMemo, useState } from 'react';
import { Plus, Pencil, Tags } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { ContentSkeleton, InlineSkeleton } from '@/components/LoadingSkeletons';

const STOCK_EFFECTS = [
  { value: 'none', label: 'No stock effect (expenses, bills)' },
  { value: 'add', label: 'Adds stock (purchases, returns in)' },
  { value: 'deduct', label: 'Deducts stock (sales, damages)' },
  { value: 'set', label: 'Sets stock (stock count)' },
];

const CATEGORY_SUGGESTIONS = [
  'Expenses', 'Purchases', 'Sales', 'Stock Returns', 'Loss & Damages', 'Inventory Count', 'Proforma',
];

interface DocType {
  id: string;
  code: string;
  name: string;
  category: string;
  prefix: string;
  affects_stock: string;
  affects_accounting: boolean;
  description: string | null;
  is_active: boolean;
  next_number: number;
}

const emptyForm = {
  id: '',
  code: '',
  name: '',
  category: 'Expenses',
  prefix: '',
  affects_stock: 'none',
  affects_accounting: true,
  description: '',
};

export default function ExpenseTypes() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('Expenses');

  const { data: types = [], isLoading } = useQuery<DocType[]>({
    queryKey: ['all-document-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_types')
        .select('*')
        .order('category')
        .order('name');
      if (error) throw error;
      return (data || []) as DocType[];
    },
  });

  const categories = useMemo(
    () => [...new Set([...CATEGORY_SUGGESTIONS, ...types.map(t => t.category)])],
    [types]
  );

  const rows = useMemo(
    () => (categoryFilter === 'all' ? types : types.filter(t => t.category === categoryFilter)),
    [types, categoryFilter]
  );

  const openNew = () => { setForm({ ...emptyForm, category: categoryFilter === 'all' ? 'Expenses' : categoryFilter }); setOpen(true); };
  const openEdit = (t: DocType) => {
    setForm({
      id: t.id, code: t.code, name: t.name, category: t.category, prefix: t.prefix,
      affects_stock: t.affects_stock, affects_accounting: t.affects_accounting,
      description: t.description || '',
    });
    setOpen(true);
  };

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    const prefix = (form.prefix.trim() || code).toUpperCase();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!code) { toast.error('Code is required'); return; }
    if (!form.category.trim()) { toast.error('Category is required'); return; }

    setSaving(true);
    try {
      const payload = {
        code,
        name: form.name.trim(),
        category: form.category.trim(),
        prefix,
        affects_stock: form.affects_stock,
        affects_accounting: form.affects_accounting,
        description: form.description.trim() || null,
      };
      if (form.id) {
        const { error } = await supabase.from('document_types').update(payload).eq('id', form.id);
        if (error) throw error;
        toast.success('Type updated');
      } else {
        const dup = types.find(t => t.code === code || t.prefix === prefix);
        if (dup) { toast.error(`Code or prefix already used by "${dup.name}"`); setSaving(false); return; }
        const { error } = await supabase.from('document_types').insert(payload);
        if (error) throw error;
        toast.success('Type created');
      }
      setOpen(false);
      setForm({ ...emptyForm });
      queryClient.invalidateQueries({ queryKey: ['all-document-types'] });
      queryClient.invalidateQueries({ queryKey: ['document_types'] });
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  const toggle = async (t: DocType) => {
    const { error } = await supabase.from('document_types').update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${t.name} ${!t.is_active ? 'activated' : 'deactivated'}`);
    queryClient.invalidateQueries({ queryKey: ['all-document-types'] });
    queryClient.invalidateQueries({ queryKey: ['document_types'] });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Expense &amp; document types</h1>
          <p className="text-sm text-muted-foreground">Define the expense and document types available when recording documents.</p>
        </div>
        <div className="flex gap-2">
          <RecordsToolbar
            disabled={rows.length === 0}
            getData={() => ({
              title: 'Expense & Document Types',
              subtitle: `${rows.length} type(s)`,
              filename: 'document_types',
              headers: ['#', 'Name', 'Code', 'Category', 'Prefix', 'Stock effect', 'Status'],
              rows: rows.map((t, i) => [i + 1, t.name, t.code, t.category, t.prefix, t.affects_stock, t.is_active ? 'Active' : 'Inactive']),
            })}
          />
          <Button className="gap-2" onClick={openNew}><Plus className="w-4 h-4" /> New type</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-xs">Category</Label>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-0"><ContentSkeleton rows={6} /></CardContent></Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            <Tags className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            No types in this category yet.
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Stock effect</TableHead>
                <TableHead>Next no.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.code}</TableCell>
                  <TableCell>{t.category}</TableCell>
                  <TableCell>{t.prefix}</TableCell>
                  <TableCell className="text-xs">{t.affects_stock}</TableCell>
                  <TableCell className="text-xs">{t.next_number}</TableCell>
                  <TableCell>
                    <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-[10px]">
                      {t.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Switch checked={t.is_active} onCheckedChange={() => toggle(t)} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{form.id ? 'Edit type' : 'New type'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Goods Purchase" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Code *</Label>
                <Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="e.g. GDP" disabled={!!form.id} />
              </div>
              <div>
                <Label className="text-xs">Prefix</Label>
                <Input value={form.prefix} onChange={e => setForm(p => ({ ...p, prefix: e.target.value.toUpperCase() }))} placeholder="defaults to code" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Category *</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Stock effect</Label>
              <Select value={form.affects_stock} onValueChange={v => setForm(p => ({ ...p, affects_stock: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STOCK_EFFECTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm">Affects accounting</p>
                <p className="text-[11px] text-muted-foreground">Include in expense / financial reports</p>
              </div>
              <Switch checked={form.affects_accounting} onCheckedChange={v => setForm(p => ({ ...p, affects_accounting: v }))} />
            </div>
            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : form.id ? 'Save changes' : 'Create type'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
