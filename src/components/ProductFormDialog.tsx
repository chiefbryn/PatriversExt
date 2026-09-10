import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { useCreateProduct, useUpdateProduct, type Product } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { CalendarIcon } from 'lucide-react';
import { format, parse } from 'date-fns';
import { cn } from '@/lib/utils';
import { InlineSkeleton } from '@/components/LoadingSkeletons';

const CATEGORIES = ['ANTIFUNGAL & ANTIVIRALS', 'ANTIMALARIA', 'ANTIBIOTICS', 'ANTIDIABETIC', 'ANTIDEPRESSANTS', 'ANTISTIMULANT & MULTIVITAMINS', 'DIETARY AND SUPPLEMENT', 'ANALGESICS', 'ANTACIDS', 'HAEMATINICS', 'COUGH & COLD', 'HERBALS & SOAPS', 'OINTMENT AND CREAMS', 'DAILY SNACKS', 'GENERAL'];
const FALLBACK_UOMS = ['Tablet', 'Capsule', 'Bottle', 'Sachet', 'Tube', 'Pack', 'Vial', 'Strip', 'Box', 'Piece'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onCreated?: (product: Product) => void;
  /**
   * Used when creating a product from inside a Goods Received / purchase document.
   * The document line supplies the stock, so the product must start at 0 to avoid
   * counting the received quantity twice.
   */
  lockQtyZero?: boolean;
}

export function ProductFormDialog({ open, onOpenChange, product, onCreated, lockQtyZero }: Props) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const isEdit = !!product;
  const [uoms, setUoms] = useState<string[]>(FALLBACK_UOMS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('units_of_measure' as any)
        .select('name')
        .eq('is_active', true)
        .order('sort_order');
      if (cancelled) return;
      if (!error && data && data.length > 0) {
        setUoms((data as any[]).map(r => r.name));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [form, setForm] = useState<{
    name: string; category: string; indication: string;
    qty: number | ''; reorder_level: number | '';
    uom: string; cost_price: number | ''; sales_price: number | ''; wholesale_price: number | '';
    expiry_date: string; supplier_name: string; batch_number: string;
  }>({
    name: '', category: 'General', indication: '', qty: '', reorder_level: '',
    uom: '', cost_price: '', sales_price: '', wholesale_price: '', expiry_date: '',
    supplier_name: '', batch_number: '',
  });

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name, category: product.category, indication: product.indication || '',
        qty: product.qty, reorder_level: product.reorder_level, uom: product.uom,
        cost_price: Number(product.cost_price), sales_price: Number(product.sales_price),
        wholesale_price: Number((product as any).wholesale_price || 0),
        expiry_date: product.expiry_date || '', supplier_name: product.supplier_name || '',
        batch_number: product.batch_number || '',
      });
    } else {
      setForm({ name: '', category: 'General', indication: '', qty: '', reorder_level: '', uom: '', cost_price: '', sales_price: '', wholesale_price: '', expiry_date: '', supplier_name: '', batch_number: '' });
    }
  }, [product, open]);

  const set = (key: string, value: string | number) => setForm(prev => ({ ...prev, [key]: value }));
  const setNum = (key: 'qty' | 'reorder_level' | 'cost_price' | 'sales_price' | 'wholesale_price', raw: string, parser: (v: string) => number) =>
    setForm(prev => ({ ...prev, [key]: raw === '' ? '' : (parser(raw) || 0) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Product name is required'); return; }
    if (!form.uom.trim()) { toast.error('Please select a unit of measure'); return; }
    if (!lockQtyZero && typeof form.qty !== 'number') { toast.error('Quantity is required'); return; }
    if (typeof form.sales_price !== 'number' || form.sales_price <= 0) { toast.error('Selling price is required'); return; }
    try {
      const payload = {
        ...form,
        qty: lockQtyZero ? 0 : (typeof form.qty === 'number' ? form.qty : 0),
        reorder_level: typeof form.reorder_level === 'number' ? form.reorder_level : 0,
        cost_price: typeof form.cost_price === 'number' ? form.cost_price : 0,
        sales_price: typeof form.sales_price === 'number' ? form.sales_price : 0,
        wholesale_price: typeof form.wholesale_price === 'number' ? form.wholesale_price : 0,
        indication: form.indication.trim() || null,
        expiry_date: form.expiry_date || null,
        supplier_name: form.supplier_name || null,
        batch_number: form.batch_number || null,
      };
      if (isEdit && product) {
        await update.mutateAsync({ id: product.id, ...payload });
        toast.success('Product updated');
      } else {
        const created = await create.mutateAsync(payload);
        toast.success('Product added');
        if (created && onCreated) onCreated(created as Product);
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save product');
    }
  };

  const loading = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Product' : 'Add Product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Product Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Paracetamol 500mg" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit of Measure *</Label>
              <Select value={form.uom} onValueChange={v => set('uom', v)}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>{uoms.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity {lockQtyZero ? '' : '*'}</Label>
              <Input type="number" min={0} required={!lockQtyZero} disabled={lockQtyZero}
                value={lockQtyZero ? 0 : form.qty} placeholder=""
                onChange={e => setNum('qty', e.target.value, parseInt)} />
              {lockQtyZero && (
                <p className="text-[11px] text-muted-foreground">Stock comes from this goods-received line — starts at 0 to avoid double counting.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Reorder Level</Label>
              <Input type="number" min={0} value={form.reorder_level} placeholder="" onChange={e => setNum('reorder_level', e.target.value, parseInt)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cost Price (GH₵)</Label>
              <Input type="number" min={0} step="0.01" value={form.cost_price} placeholder="" onChange={e => setNum('cost_price', e.target.value, parseFloat)} />
            </div>
            <div className="space-y-1.5">
              <Label>Retail Price (GH₵) *</Label>
              <Input type="number" min={0} step="0.01" required value={form.sales_price} placeholder="" onChange={e => setNum('sales_price', e.target.value, parseFloat)} />
            </div>
            <div className="space-y-1.5">
              <Label>Wholesale Price (GH₵)</Label>
              <Input type="number" min={0} step="0.01" value={form.wholesale_price} placeholder="" onChange={e => setNum('wholesale_price', e.target.value, parseFloat)} />
              <p className="text-[11px] text-muted-foreground">Used when a sale is set to wholesale. Leave empty to charge the retail price.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.expiry_date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.expiry_date ? format(parse(form.expiry_date, 'yyyy-MM-dd', new Date()), 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.expiry_date ? parse(form.expiry_date, 'yyyy-MM-dd', new Date()) : undefined}
                    onSelect={(date) => set('expiry_date', date ? format(date, 'yyyy-MM-dd') : '')}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Batch Number</Label>
              <Input value={form.batch_number} onChange={e => set('batch_number', e.target.value)} placeholder="e.g. BN-20260101" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Supplier</Label>
              <Input value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} placeholder="e.g. Ernest Chemists" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Indication / Use</Label>
              <Textarea
                value={form.indication}
                onChange={e => set('indication', e.target.value)}
                placeholder="Type the product indication or use manually..."
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? <InlineSkeleton className="h-4 w-16 bg-primary-foreground/30" /> : isEdit ? 'Update' : 'Add Product'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
