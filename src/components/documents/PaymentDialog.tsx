import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useDocumentPayments, usePaymentTypes, useDocumentMutations, useDocument } from '@/hooks/useDocuments';
import { ContentSkeleton, InlineSkeleton } from '@/components/LoadingSkeletons';

interface Props {
  documentId: string;
  balanceDue?: number;
  onClose?: () => void;
  embedded?: boolean;
}

export function PaymentDialog({ documentId, balanceDue, onClose, embedded }: Props) {
  const { data: payments = [], isLoading } = useDocumentPayments(documentId);
  const { data: doc } = useDocument(documentId);
  const { data: paymentTypes = [] } = usePaymentTypes();
  const { addPayment } = useDocumentMutations();

  const [amount, setAmount] = useState('');
  const [paymentTypeId, setPaymentTypeId] = useState('');
  const [reference, setReference] = useState('');
  const [paidBy, setPaidBy] = useState('');

  const balance = balanceDue ?? Number(doc?.balance_due || 0);
  const totalPaid = payments.filter(p => p.status === 'completed').reduce((s, p) => s + Number(p.amount), 0);

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    addPayment.mutate({
      document_id: documentId,
      amount: amt,
      payment_type_id: paymentTypeId || undefined,
      reference: reference || undefined,
      paid_by: paidBy || undefined,
    }, {
      onSuccess: () => { setAmount(''); setReference(''); setPaidBy(''); },
    });
  };

  const content = isLoading ? <ContentSkeleton rows={4} /> : (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-muted/50 rounded-md p-4 grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-semibold">GH₵ {Number(doc?.total || 0).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-lg font-semibold text-accent">GH₵ {totalPaid.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className={`text-lg font-semibold ${balance > 0 ? 'text-orange-600' : 'text-accent'}`}>
            GH₵ {balance.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Payment History</h4>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{new Date(p.paid_at).toLocaleString('en-GB')}</TableCell>
                    <TableCell className="text-xs">{(p.payment_types as any)?.name || '—'}</TableCell>
                    <TableCell className="text-xs">{p.reference || '—'}</TableCell>
                    <TableCell className="text-right text-sm font-medium">GH₵ {Number(p.amount).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
                        {p.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Add payment form */}
      {balance > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground">Add Payment</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount *</Label>
              <Input
                type="number"
                min={0.01}
                max={balance}
                step={0.01}
                className="h-9"
                placeholder={`Max: ${balance.toFixed(2)}`}
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Payment Method</Label>
              <Select value={paymentTypeId} onValueChange={setPaymentTypeId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {paymentTypes.map((pt: any) => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reference</Label>
              <Input className="h-9" placeholder="e.g. receipt #" value={reference} onChange={e => setReference(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Paid By</Label>
              <Input className="h-9" placeholder="Name" value={paidBy} onChange={e => setPaidBy(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAmount(balance.toFixed(2))}
            >
              Pay Full Balance
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={addPayment.isPending || !amount || parseFloat(amount) <= 0}
              className="gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              {addPayment.isPending ? <InlineSkeleton className="h-4 w-24 bg-primary-foreground/30" /> : 'Record Payment'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Payments</CardTitle></CardHeader>
        <CardContent>{content}</CardContent>
      </Card>
    );
  }

  return (
    <Dialog open onOpenChange={() => onClose?.()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Payment</DialogTitle></DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
