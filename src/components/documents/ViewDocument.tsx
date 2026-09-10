import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, CreditCard, History, Trash2, Save, Plus, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ProductPicker } from './ProductPicker';
import { PaymentDialog } from './PaymentDialog';
import { AuditLogViewer } from './AuditLogViewer';
import { ExpenseFields, hasExpenseFields } from './ExpenseFields';
import {
  useDocument, useDocumentMutations, useDocumentCategories,
  type Document as DocType
} from '@/hooks/useDocuments';
import { useAuth } from '@/hooks/useAuth';
import { ContentSkeleton, InlineSkeleton } from '@/components/LoadingSkeletons';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  confirmed: 'bg-blue-100 text-blue-700',
  posted: 'bg-blue-100 text-blue-700',
  completed: 'bg-accent/10 text-accent',
  cancelled: 'bg-destructive/10 text-destructive',
  voided: 'bg-destructive/10 text-destructive',
};

const PAYMENT_COLORS: Record<string, string> = {
  unpaid: 'bg-orange-100 text-orange-700',
  partial: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-accent/10 text-accent',
};

interface Props {
  documentId: string;
  onBack: () => void;
}

export function ViewDocument({ documentId, onBack }: Props) {
  const { role } = useAuth();
  const { data: doc, isLoading } = useDocument(documentId);
  const { addItem, updateItem, removeItem, updateDraft, confirmDoc, voidDoc, editHistorical } = useDocumentMutations();
  const { subTypes } = useDocumentCategories();

  const [showPayment, setShowPayment] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  // Inline editing state
  const [editCustomer, setEditCustomer] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<string | null>(null);
  const [editRef, setEditRef] = useState<string | null>(null);

  // Historical edit dialog (Purchases — admin/CEO only, preserves current stock)
  const [showHistoricalEdit, setShowHistoricalEdit] = useState(false);
  const [historicalDraft, setHistoricalDraft] = useState<Record<string, { quantity: number; unit_price: number }>>({});
  const [historicalRemoved, setHistoricalRemoved] = useState<Set<string>>(new Set());
  const [historicalNew, setHistoricalNew] = useState<Array<{ product_id: string; name: string; quantity: number; unit_price: number }>>([]);

  if (isLoading) return <ContentSkeleton rows={7} />;
  if (!doc) return <div className="py-16 text-center text-muted-foreground">Document not found</div>;

  const isDraft = doc.status === 'draft';
  const isLocked = ['voided', 'cancelled'].includes(doc.status);
  const isAdmin = role === 'admin';
  const isCeo = role === 'ceo';
  const canEdit = isDraft || isAdmin;
  const canConfirm = isDraft && (doc.document_items?.length || 0) > 0;
  const canPay = ['posted', 'confirmed', 'draft'].includes(doc.status) && doc.payment_status !== 'paid';
  const canVoid = !isLocked && isAdmin;
  const canHistoricalEdit =
    (isAdmin || isCeo)
    && doc.category === 'Purchases'
    && ['confirmed', 'posted', 'completed'].includes(doc.status);

  const priceField = doc.category === 'Purchases' ? 'cost_price' : 'sales_price';

  const handleAddProduct = (product: any) => {
    addItem.mutate({
      document_id: doc.id,
      product_id: product.id,
      quantity: 1,
      unit_price: Number(product[priceField]),
    });
  };

  const stockImpact: 'add' | 'deduct' | 'set' | 'none' = (() => {
    const cat = doc.category;
    const sub = doc.sub_type;
    if (cat === 'Purchases') return 'add';
    if (cat === 'Sales') return 'deduct';
    if (cat === 'Loss & Damages') return 'deduct';
    if (cat === 'Inventory Count') return 'set';
    if (cat === 'Stock Returns') return sub === 'Return to Supplier' ? 'deduct' : 'add';
    return 'none';
  })();

  const handleConfirm = () => {
    setShowConfirmDialog(false);
    confirmDoc.mutate({ document_id: doc.id });
  };

  const handleVoid = () => {
    if (!voidReason.trim()) return;
    voidDoc.mutate({ document_id: doc.id, reason: voidReason }, {
      onSuccess: () => { setShowVoidDialog(false); setVoidReason(''); },
    });
  };

  const saveDraftField = (field: string, value: string | null) => {
    updateDraft.mutate({ document_id: doc.id, [field]: value || '' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div>
            <h2 className="text-lg font-semibold font-mono">
              {doc.doc_number || 'Draft Document'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className={STATUS_COLORS[doc.status]}>{doc.status}</Badge>
              <Badge className={PAYMENT_COLORS[doc.payment_status]}>{doc.payment_status}</Badge>
              <Badge variant="outline" className="text-[10px]">{doc.category}</Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canPay && (
            <Button variant="outline" size="sm" onClick={() => setShowPayment(true)} className="gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> Add Payment
            </Button>
          )}
          {canConfirm && (
            <Button size="sm" onClick={() => setShowConfirmDialog(true)} disabled={confirmDoc.isPending} className="gap-1.5 bg-accent hover:bg-accent/90">
              {!confirmDoc.isPending && <CheckCircle2 className="w-3.5 h-3.5" />} {confirmDoc.isPending ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : 'Confirm'}
            </Button>
          )}
          {canHistoricalEdit && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => {
                const draft: Record<string, { quantity: number; unit_price: number }> = {};
                doc.document_items?.forEach((it: any) => {
                  draft[it.id] = { quantity: Number(it.quantity), unit_price: Number(it.unit_price) };
                });
                setHistoricalDraft(draft);
                setHistoricalRemoved(new Set());
                setHistoricalNew([]);
                setShowHistoricalEdit(true);
              }}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit (Historical)
            </Button>
          )}
          {canVoid && (
            <Button variant="destructive" size="sm" onClick={() => setShowVoidDialog(true)} className="gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Void
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details & Items</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1"><CreditCard className="w-3 h-3" /> Payments</TabsTrigger>
          <TabsTrigger value="activity" className="gap-1"><History className="w-3 h-3" /> Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Info panel */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Information</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category</span>
                  <span className="font-medium">{doc.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span>{doc.sub_type}</span>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">External Ref</Label>
                  {isDraft ? (
                    <Input
                      className="h-8 mt-1"
                      value={editRef ?? doc.external_ref ?? ''}
                      onChange={e => setEditRef(e.target.value)}
                      onBlur={() => { if (editRef !== null) { saveDraftField('external_ref', editRef); setEditRef(null); } }}
                    />
                  ) : (
                    <p className="text-sm">{doc.external_ref || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Customer / Supplier</Label>
                  {isDraft ? (
                    <Input
                      className="h-8 mt-1"
                      value={editCustomer ?? doc.customer_name ?? ''}
                      onChange={e => setEditCustomer(e.target.value)}
                      onBlur={() => { if (editCustomer !== null) { saveDraftField('customer_name', editCustomer); setEditCustomer(null); } }}
                    />
                  ) : (
                    <p className="text-sm">{doc.customer_name || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  {isDraft ? (
                    <Textarea
                      rows={2}
                      className="mt-1"
                      value={editNotes ?? doc.notes ?? ''}
                      onChange={e => setEditNotes(e.target.value)}
                      onBlur={() => { if (editNotes !== null) { saveDraftField('notes', editNotes); setEditNotes(null); } }}
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{doc.notes || '—'}</p>
                  )}
                </div>

                {/* Expense-specific metadata */}
                {doc.document_types?.code && hasExpenseFields(doc.document_types.code as string) && doc.metadata && Object.keys(doc.metadata).length > 0 && (
                  <>
                    <Separator />
                    <ExpenseFields
                      typeCode={doc.document_types.code as string}
                      metadata={doc.metadata || {}}
                      onChange={() => {}}
                      readOnly
                    />
                  </>
                )}

                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="text-xs">{new Date(doc.created_at).toLocaleString('en-GB')}</span></div>

                {/* Totals */}
                <Separator />
                <div className="bg-muted/50 rounded-md p-3 space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>GH₵ {Number(doc.subtotal).toFixed(2)}</span></div>
                  {Number(doc.tax) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>GH₵ {Number(doc.tax).toFixed(2)}</span></div>}
                  {Number(doc.discount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">-GH₵ {Number(doc.discount).toFixed(2)}</span></div>}
                  <Separator />
                  <div className="flex justify-between font-semibold"><span>Total</span><span>GH₵ {Number(doc.total).toFixed(2)}</span></div>
                  <div className="flex justify-between text-accent"><span>Paid</span><span>GH₵ {Number(doc.amount_paid).toFixed(2)}</span></div>
                  {Number(doc.balance_due) > 0 && (
                    <div className="flex justify-between text-orange-600 font-medium"><span>Balance</span><span>GH₵ {Number(doc.balance_due).toFixed(2)}</span></div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Items */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Line Items ({doc.document_items?.length || 0})</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {isDraft && <ProductPicker onSelect={handleAddProduct} priceField={priceField as any} />}

                {(doc.document_items?.length || 0) === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No items</p>
                ) : (
                  <div className="border rounded-lg overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="w-20">Qty</TableHead>
                          <TableHead className="w-28">Unit Price</TableHead>
                          <TableHead className="w-24 text-right">Amount</TableHead>
                          {isDraft && <TableHead className="w-10" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {doc.document_items?.map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="text-sm">{item.products?.name || '—'}</TableCell>
                            <TableCell>
                              {isDraft ? (
                                <Input
                                  type="number" min={1} className="h-8 w-16"
                                  defaultValue={item.quantity}
                                  onBlur={e => {
                                    const v = Math.max(1, parseInt(e.target.value) || 1);
                                    if (v !== item.quantity) updateItem.mutate({ item_id: item.id, quantity: v });
                                  }}
                                />
                              ) : (
                                <span className="text-sm">{item.quantity}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {isDraft ? (
                                <Input
                                  type="number" min={0} step={0.01} className="h-8 w-24"
                                  defaultValue={item.unit_price}
                                  onBlur={e => {
                                    const v = Math.max(0, parseFloat(e.target.value) || 0);
                                    if (v !== item.unit_price) updateItem.mutate({ item_id: item.id, unit_price: v });
                                  }}
                                />
                              ) : (
                                <span className="text-sm">GH₵ {Number(item.unit_price).toFixed(2)}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">GH₵ {Number(item.amount).toFixed(2)}</TableCell>
                            {isDraft && (
                              <TableCell>
                                <button
                                  onClick={() => removeItem.mutate({ item_id: item.id })}
                                  className="text-destructive hover:text-destructive/80"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <PaymentDialog documentId={doc.id} embedded />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <AuditLogViewer documentId={doc.id} />
        </TabsContent>
      </Tabs>

      {/* Payment modal */}
      {showPayment && (
        <PaymentDialog
          documentId={doc.id}
          balanceDue={Number(doc.balance_due)}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* Void dialog */}
      <Dialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Void Document</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The document will be permanently locked.
          </p>
          <div>
            <Label>Reason *</Label>
            <Textarea
              placeholder="Why is this document being voided?"
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowVoidDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoid} disabled={!voidReason.trim() || voidDoc.isPending}>
              {voidDoc.isPending ? <InlineSkeleton className="h-4 w-20 bg-destructive-foreground/30" /> : 'Void Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog — explains stock impact */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {doc.category} Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              You are about to confirm and post this document. A document number will be assigned and totals will be locked.
            </p>
            {stockImpact !== 'none' && (doc.document_items?.length || 0) > 0 && (
              <div className={`rounded-md border p-3 ${
                stockImpact === 'add' ? 'bg-accent/5 border-accent/30' :
                stockImpact === 'set' ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800' :
                'bg-warning/10 border-warning/30'
              }`}>
                <div className="font-medium mb-2 flex items-center gap-1.5">
                  {stockImpact === 'add' && <>Stock will be increased</>}
                  {stockImpact === 'deduct' && <>Stock will be reduced</>}
                  {stockImpact === 'set' && <>Stock will be set to counted values</>}
                </div>
                <ul className="space-y-1 text-xs max-h-40 overflow-y-auto">
                  {doc.document_items?.map((it: any) => (
                    <li key={it.id} className="flex justify-between gap-3">
                      <span className="truncate">{it.products?.name || 'Item'}</span>
                      <span className="font-mono shrink-0">
                        {stockImpact === 'add' && `+${it.quantity}`}
                        {stockImpact === 'deduct' && `−${it.quantity}`}
                        {stockImpact === 'set' && `= ${it.quantity}`}
                        {' '}{it.products?.uom || ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Inventory will recalculate immediately and a stock-movement entry will be recorded for each line.
                </p>
              </div>
            )}
            {stockImpact === 'none' && (
              <p className="text-xs text-muted-foreground italic">This document does not affect stock levels.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={confirmDoc.isPending} className="bg-accent hover:bg-accent/90 gap-1.5">
              {!confirmDoc.isPending && <CheckCircle2 className="w-4 h-4" />}
              {confirmDoc.isPending ? <InlineSkeleton className="h-4 w-24 bg-primary-foreground/30" /> : 'Confirm & Post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historical edit — Purchases only, admin/CEO. Adjusts the recorded
          line and the historical stock movement on the doc's original date,
          but does NOT change current product stock. */}
      <Dialog open={showHistoricalEdit} onOpenChange={setShowHistoricalEdit}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Historical Purchase</DialogTitle>
          </DialogHeader>
          <div className="text-xs bg-amber-50 border border-amber-200 rounded p-3 text-amber-900">
            Use this to correct, add, or remove items on <strong>{doc.doc_number}</strong>.
            Changes apply on the document's original date (so Stock&nbsp;by&nbsp;Date for that
            day reflects the truth), but the current inventory levels stay exactly as they
            are now — stock is rebuilt automatically from the movement history.
          </div>
          <div className="border rounded-lg overflow-auto max-h-[55vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-28">Quantity</TableHead>
                  <TableHead className="w-32">Unit Price</TableHead>
                  <TableHead className="w-24 text-right">New Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.document_items?.map((it: any) => {
                  const d = historicalDraft[it.id] || { quantity: it.quantity, unit_price: it.unit_price };
                  const removed = historicalRemoved.has(it.id);
                  return (
                    <TableRow key={it.id} className={removed ? 'opacity-50 line-through' : ''}>
                      <TableCell className="text-sm">
                        {it.products?.name || '—'}
                        <div className="text-[10px] text-muted-foreground no-underline">
                          Original: qty {it.quantity} @ GH₵ {Number(it.unit_price).toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" min={1} className="h-8 w-24"
                          value={d.quantity}
                          disabled={removed}
                          onChange={e => setHistoricalDraft(prev => ({
                            ...prev,
                            [it.id]: { ...d, quantity: Math.max(1, parseInt(e.target.value) || 1) },
                          }))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" min={0} step={0.01} className="h-8 w-28"
                          value={d.unit_price}
                          disabled={removed}
                          onChange={e => setHistoricalDraft(prev => ({
                            ...prev,
                            [it.id]: { ...d, unit_price: Math.max(0, parseFloat(e.target.value) || 0) },
                          }))}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        GH₵ {(d.quantity * d.unit_price).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          title={removed ? 'Undo remove' : 'Remove from document'}
                          onClick={() => setHistoricalRemoved(prev => {
                            const next = new Set(prev);
                            if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
                            return next;
                          })}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {historicalNew.map((n, idx) => (
                  <TableRow key={`new-${idx}`} className="bg-accent/5">
                    <TableCell className="text-sm">
                      <span className="font-medium">{n.name}</span>
                      <div className="text-[10px] text-accent">New item</div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={1} className="h-8 w-24"
                        value={n.quantity}
                        onChange={e => setHistoricalNew(prev => prev.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, parseInt(e.target.value) || 1) } : x))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0} step={0.01} className="h-8 w-28"
                        value={n.unit_price}
                        onChange={e => setHistoricalNew(prev => prev.map((x, i) => i === idx ? { ...x, unit_price: Math.max(0, parseFloat(e.target.value) || 0) } : x))}
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      GH₵ {(n.quantity * n.unit_price).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setHistoricalNew(prev => prev.filter((_, i) => i !== idx))}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Add product to this historical purchase</Label>
            <div className="mt-1">
              <ProductPicker
                priceField="cost_price"
                onSelect={(p) => setHistoricalNew(prev => [
                  ...prev,
                  { product_id: p.id, name: p.name, quantity: 1, unit_price: Number(p.cost_price) || 0 },
                ])}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowHistoricalEdit(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const items = Object.entries(historicalDraft)
                  .filter(([item_id]) => !historicalRemoved.has(item_id))
                  .map(([item_id, v]) => ({ item_id, quantity: v.quantity, unit_price: v.unit_price }));
                const removed_item_ids = Array.from(historicalRemoved);
                const new_items = historicalNew
                  .filter(n => n.product_id && n.quantity > 0)
                  .map(n => ({ product_id: n.product_id, quantity: n.quantity, unit_price: n.unit_price }));
                editHistorical.mutate(
                  { document_id: doc.id, items, removed_item_ids, new_items },
                  { onSuccess: () => setShowHistoricalEdit(false) }
                );
              }}
              disabled={editHistorical.isPending}
              className="gap-1.5"
            >
              {!editHistorical.isPending && <Save className="w-4 h-4" />}
              {editHistorical.isPending ? <InlineSkeleton className="h-4 w-28 bg-primary-foreground/30" /> : 'Save Historical Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
