import { useState, useMemo } from 'react';
import { ArrowLeft, Trash2, FileText, Save, Plus } from 'lucide-react';
import { ProductFormDialog } from '@/components/ProductFormDialog';

import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { ProductPicker } from './ProductPicker';
import { ExpenseFields, hasExpenseFields } from './ExpenseFields';
import { useDocumentCategories, useDocumentMutations } from '@/hooks/useDocuments';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { InlineSkeleton } from '@/components/LoadingSkeletons';

interface LineItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
  uom: string;
  markup_pct: number;
  sales_price: number;
  original_sales_price: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}

interface Props {
  onBack: () => void;
  onCreated: (docId: string) => void;
}

export function CreateDocument({ onBack, onCreated }: Props) {
  const { categories, subTypes } = useDocumentCategories();
  const { createDraft } = useDocumentMutations();
  const { role } = useAuth();
  const canBackdate = role === 'admin' || role === 'ceo';

  const [category, setCategory] = useState('');
  const [subType, setSubType] = useState('');
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [tax, setTax] = useState<number | ''>('');
  const [discount, setDiscount] = useState<number | ''>('');
  const [directAmount, setDirectAmount] = useState<number | ''>('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [documentDate, setDocumentDate] = useState('');


  const selectedType = useMemo(() => {
    if (!category || !subType) return null;
    return (subTypes[category] || []).find(t => t.name === subType) || null;
  }, [category, subType, subTypes]);

  const typeCode = selectedType?.code || '';
  const isExpense = category === 'Expenses';
  const isSales = category === 'Sales';
  const priceField = category === 'Purchases' ? 'cost_price' : 'sales_price';

  // For expense types, compute total from metadata if applicable (e.g. utility bills)
  const expenseTotal = useMemo(() => {
    if (!isExpense) return 0;
    if ((typeCode === 'ELC' || typeCode === 'WTR') && metadata.units_consumed && metadata.rate_per_unit) {
      return Math.round(Number(metadata.units_consumed) * Number(metadata.rate_per_unit) * 100) / 100;
    }
    return 0;
  }, [isExpense, typeCode, metadata]);

  const addProduct = (product: any) => {
    if (lines.find(l => l.product_id === product.id)) return;
    const price = Number(product[priceField]);
    const currentSales = Number(product.sales_price) || price;
    const markup = price > 0 ? Math.round(((currentSales - price) / price) * 10000) / 100 : 0;
    setLines(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      unit_price: price,
      amount: price,
      uom: product.uom,
      markup_pct: markup,
      sales_price: currentSales,
      original_sales_price: currentSales,
      batch_number: product.batch_number || null,
      expiry_date: product.expiry_date || null,
    }]);
  };

  const updateLine = (idx: number, field: 'quantity' | 'unit_price' | 'markup_pct' | 'sales_price', val: number) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: val };
      if (field === 'unit_price' || field === 'quantity') {
        updated.amount = Math.round(updated.quantity * updated.unit_price * 100) / 100;
      }
      if (field === 'unit_price') {
        // recompute sales price from current markup
        updated.sales_price = Math.round(updated.unit_price * (1 + (updated.markup_pct || 0) / 100) * 100) / 100;
      }
      if (field === 'markup_pct') {
        updated.sales_price = Math.round(updated.unit_price * (1 + val / 100) * 100) / 100;
      }
      if (field === 'sales_price') {
        updated.markup_pct = updated.unit_price > 0
          ? Math.round(((val - updated.unit_price) / updated.unit_price) * 10000) / 100
          : 0;
      }
      return updated;
    }));
  };

  const updateStockDetails = (idx: number, field: 'batch_number' | 'expiry_date', value: string) => {
    setLines(prev => prev.map((line, index) => index === idx ? { ...line, [field]: value || null } : line));
  };

  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const taxNum = typeof tax === 'number' ? tax : 0;
  const discountNum = typeof discount === 'number' ? discount : 0;
  const directAmountNum = typeof directAmount === 'number' ? directAmount : 0;
  const subtotal = lines.length > 0 ? lines.reduce((s, l) => s + l.amount, 0) : (isExpense ? (expenseTotal > 0 ? expenseTotal : directAmountNum) : directAmountNum);
  const total = Math.round((subtotal + taxNum - discountNum) * 100) / 100;

  const canSave = category && subType && (total > 0 || lines.length > 0) && (isSales ? customerName.trim().length > 0 || subType === 'Walk-in Sale' : true);

  const isPurchase = category === 'Purchases';

  const handleSave = () => {
    const docAmount = lines.length > 0 ? undefined : subtotal;
    createDraft.mutate({
      category,
      sub_type: subType,
      document_type_id: selectedType?.id || undefined,
      external_ref: externalRef || undefined,
      customer_name: customerName || undefined,
      notes: notes || undefined,
      tax: taxNum,
      discount: discountNum,
      amount: docAmount,
      subtotal: docAmount,
      total: docAmount != null ? Math.round((docAmount + taxNum - discountNum) * 100) / 100 : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      document_date: (canBackdate && isExpense && documentDate) ? documentDate : undefined,
      items: lines.map(l => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
         batch_number: l.batch_number || undefined,
         expiry_date: l.expiry_date || undefined,
      })),
    } as any, {
      onSuccess: async (data) => {
        if ((data as any)?.offline) {
          onBack();
          return;
        }
        // For purchases, push updated sales price back to product master where changed
        if (isPurchase) {
          const changed = lines.filter(l => l.sales_price > 0 && Math.abs(l.sales_price - l.original_sales_price) > 0.0001);
          if (changed.length > 0) {
            const results = await Promise.all(changed.map(l =>
              supabase.from('products').update({ sales_price: l.sales_price }).eq('id', l.product_id)
            ));
            const failed = results.filter(r => r.error).length;
            if (failed === 0) toast.success(`Updated selling price for ${changed.length} product(s)`);
            else toast.error(`Failed to update ${failed} product price(s)`);
          }
        }
        if (data?.id) onCreated(data.id);
        else onBack();
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <h2 className="text-lg font-semibold">New Document</h2>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: Details */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Document Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Category *</Label>
              <Select value={category} onValueChange={v => { setCategory(v); setSubType(''); setDocumentTypeId(''); setMetadata({}); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {category && (
              <div>
                <Label className="text-xs">Type *</Label>
                <Select value={subType} onValueChange={v => {
                  setSubType(v);
                  setMetadata({});
                  const type = (subTypes[category] || []).find(t => t.name === v);
                  if (type) setDocumentTypeId(type.id);
                }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {(subTypes[category] || []).filter(s => s.code !== 'PAY').map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dynamic expense fields */}
            {typeCode && hasExpenseFields(typeCode) && (
              <>
                <Separator />
                <ExpenseFields
                  typeCode={typeCode}
                  metadata={metadata}
                  onChange={setMetadata}
                />
              </>
            )}

            <div>
              <Label className="text-xs">External Ref / Invoice #</Label>
              <Input placeholder="e.g. SUP-2024-0012" className="h-9" value={externalRef} onChange={e => setExternalRef(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">
                {isSales ? 'Customer Name' : isExpense ? 'Vendor / Payee' : 'Customer / Supplier'}
                {isSales && subType !== 'Walk-in Sale' && ' *'}
              </Label>
              <Input placeholder={isSales ? 'Walk-in' : 'Name'} className="h-9" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} placeholder="Optional notes" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {canBackdate && isExpense && (
              <div>
                <Label className="text-xs">Expense Date (backdate)</Label>
                <Input
                  type="date"
                  className="h-9"
                  max={new Date().toISOString().slice(0, 10)}
                  value={documentDate}
                  onChange={e => setDocumentDate(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Leave blank to use today. Admin/CEO only.</p>
              </div>
            )}

            {/* Direct Amount - shown when no line items and no auto-calculated expense total */}
            {lines.length === 0 && expenseTotal <= 0 && (
              <div>
                <Label className="text-xs font-semibold">Amount (GH₵) *</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  className="h-9"
                  placeholder="Enter document amount"
                  value={directAmount}
                  onChange={e => setDirectAmount(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                />
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tax</Label>
                <Input type="number" min={0} step={0.01} className="h-9" value={tax} onChange={e => setTax(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))} />
              </div>
              <div>
                <Label className="text-xs">Discount</Label>
                <Input type="number" min={0} step={0.01} className="h-9" value={discount} onChange={e => setDiscount(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))} />
              </div>
            </div>

            {/* Totals */}
            <div className="bg-muted/50 rounded-md p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>GH₵ {subtotal.toFixed(2)}</span></div>
              {taxNum > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>GH₵ {taxNum.toFixed(2)}</span></div>}
              {discountNum > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">-GH₵ {discountNum.toFixed(2)}</span></div>}
              <Separator />
              <div className="flex justify-between font-semibold"><span>Total</span><span>GH₵ {total.toFixed(2)}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Right: Items */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">
              {isExpense ? 'Line Items (Optional for expenses)' : 'Line Items'}
            </CardTitle>
            <div className="flex items-center gap-2">
              {isPurchase && (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setNewProductOpen(true)}>
                  <Plus className="w-4 h-4" /> New Product
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProductPicker onSelect={addProduct} priceField={priceField as any} />


            {lines.length === 0 ? (
              <div className="py-14 text-center">
                <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {isExpense
                    ? 'No items added. Expense totals can be calculated from the type-specific fields.'
                    : 'Search and add products above'}
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-20">Qty</TableHead>
                      <TableHead className="w-28">Unit Price</TableHead>
                      {isPurchase && <TableHead className="w-24">Markup %</TableHead>}
                      {isPurchase && <TableHead className="w-28">Sales Price</TableHead>}
                      {isPurchase && <TableHead className="w-28">Batch</TableHead>}
                      {isPurchase && <TableHead className="w-36">Expiry</TableHead>}
                      <TableHead className="w-24 text-right">Amount</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l, i) => (
                      <TableRow key={l.product_id}>
                        <TableCell className="text-sm">
                          {l.product_name}
                          <span className="text-xs text-muted-foreground ml-1">({l.uom})</span>
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={1} className="h-8 w-16" value={l.quantity}
                            onChange={e => updateLine(i, 'quantity', Math.max(1, parseInt(e.target.value) || 1))} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} step={0.01} className="h-8 w-24" value={l.unit_price}
                            onChange={e => updateLine(i, 'unit_price', Math.max(0, parseFloat(e.target.value) || 0))} />
                        </TableCell>
                        {isPurchase && (
                          <TableCell>
                            <Input type="number" step={0.01} className="h-8 w-20" value={l.markup_pct}
                              onChange={e => updateLine(i, 'markup_pct', parseFloat(e.target.value) || 0)} />
                          </TableCell>
                        )}
                        {isPurchase && (
                          <TableCell>
                            <Input type="number" min={0} step={0.01} className="h-8 w-24" value={l.sales_price}
                              onChange={e => updateLine(i, 'sales_price', Math.max(0, parseFloat(e.target.value) || 0))} />
                          </TableCell>
                        )}
                        {isPurchase && (
                          <TableCell>
                            <Input className="h-8 w-24" value={l.batch_number || ''} onChange={e => updateStockDetails(i, 'batch_number', e.target.value)} />
                          </TableCell>
                        )}
                        {isPurchase && (
                          <TableCell>
                            <Input type="date" className="h-8 w-32" value={l.expiry_date || ''} onChange={e => updateStockDetails(i, 'expiry_date', e.target.value)} />
                          </TableCell>
                        )}
                        <TableCell className="text-right text-sm font-medium">GH₵ {l.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <button onClick={() => removeLine(i)} className="text-destructive hover:text-destructive/80">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sticky Save Button */}
      <div className="sticky bottom-0 bg-background border-t p-4 -mx-6 -mb-6 flex justify-end gap-3 z-10">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={createDraft.isPending || !canSave}
          className="gap-1.5 min-w-[200px]"
          size="lg"
        >
          <Save className="w-4 h-4" />
          {createDraft.isPending ? <InlineSkeleton className="h-4 w-24 bg-primary-foreground/30" /> : `Save Draft (GH₵ ${total.toFixed(2)})`}
        </Button>
      </div>

      
      <ProductFormDialog
        open={newProductOpen}
        onOpenChange={setNewProductOpen}
        lockQtyZero
        onCreated={(p) => {
          addProduct(p);
          setNewProductOpen(false);
        }}
      />

    </div>
  );
}
