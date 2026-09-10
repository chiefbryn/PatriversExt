import { useState } from 'react';
import { Search, Plus, Filter, FileText, Ban, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { cn } from '@/lib/utils';
import { useDocumentList, useDocumentCategories, useDocumentsRealtime, useBulkDocumentActions, type Document } from '@/hooks/useDocuments';
import { useAuth } from '@/hooks/useAuth';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { ContentSkeleton } from '@/components/LoadingSkeletons';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  posted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-accent/10 text-accent',
  cancelled: 'bg-destructive/10 text-destructive',
  voided: 'bg-destructive/10 text-destructive',
};

const PAYMENT_COLORS: Record<string, string> = {
  unpaid: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  partial: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  paid: 'bg-accent/10 text-accent',
};

interface Props {
  onCreateNew: () => void;
  onSelectDocument: (doc: Document) => void;
}

export function DocumentList({ onCreateNew, onSelectDocument }: Props) {
  useDocumentsRealtime();
  const { categories } = useDocumentCategories();
  const [filters, setFilters] = useState<Record<string, string>>({
    search: '', status: 'all', category: 'all', payment_status: 'all', dateFrom: '', dateTo: '',
  });
  const set = (k: string, v: string) => setFilters(p => ({ ...p, [k]: v }));

  const { data: documents = [], isLoading } = useDocumentList(filters);
  const hasFilters = Object.entries(filters).some(([k, v]) => v && v !== 'all');
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const { bulkCancel, bulkDelete } = useBulkDocumentActions();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | 'cancel' | 'delete'>(null);

  const allChecked = documents.length > 0 && documents.every(d => selected.has(d.id));
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allChecked) documents.forEach(d => next.delete(d.id));
      else documents.forEach(d => next.add(d.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const runBulk = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      if (bulkAction === 'cancel') await bulkCancel.mutateAsync(ids);
      else if (bulkAction === 'delete') await bulkDelete.mutateAsync(ids);
      setSelected(new Set());
    } catch {/* toast handled in mutation */}
    setBulkAction(null);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search doc #, ref, customer..."
            className="pl-9"
            value={filters.search}
            onChange={e => set('search', e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <RecordsToolbar
            disabled={documents.length === 0}
            getData={() => {
              const totalAmount = documents.reduce((s, d) => s + Number(d.total || 0), 0);
              return {
                title: 'Documents Report',
                subtitle: `${documents.length} documents`,
                filename: 'documents_report',
                headers: ['#', 'Doc #', 'Category', 'Sub-type', 'Customer', 'Total', 'Status', 'Payment', 'Date'],
                alignRight: [5],
                rows: documents.map((d, i) => [
                  i + 1, d.doc_number || 'Draft', d.category, d.sub_type,
                  d.customer_name || '—', Number(Number(d.total).toFixed(2)),
                  d.status, d.payment_status, new Date(d.created_at).toLocaleDateString('en-GB'),
                ]),
                totalsRow: [
                  'TOTAL', `${documents.length} doc(s)`, '', '', '',
                  Number(totalAmount.toFixed(2)), '', '', '',
                ],
              };
            }}
          />
          <Button onClick={onCreateNew} className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" /> New Document
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filters.status} onValueChange={v => set('status', v)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="posted">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="voided">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.category} onValueChange={v => set('category', v)}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.payment_status} onValueChange={v => set('payment_status', v)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payment</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        <DateRangePicker
          from={filters.dateFrom}
          to={filters.dateTo}
          onFromChange={(v) => set('dateFrom', v)}
          onToChange={(v) => set('dateTo', v)}
          size="sm"
          className="w-64"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilters({ search: '', status: 'all', category: 'all', payment_status: 'all', dateFrom: '', dateTo: '' })}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">{documents.length} document{documents.length !== 1 ? 's' : ''}</p>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 bg-accent/10 border border-accent/30 rounded-md px-3 py-1.5">
            <span className="text-xs font-medium">{selected.size} selected</span>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setBulkAction('cancel')}>
              <Ban className="w-3 h-3" /> Cancel
            </Button>
            {isAdmin && (
              <Button variant="destructive" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setBulkAction('delete')}>
                <Trash2 className="w-3 h-3" /> Delete
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <Card><CardContent className="p-0"><ContentSkeleton rows={7} /></CardContent></Card>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No documents found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead className="w-28">Doc #</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="hidden md:table-cell">Sub-type</TableHead>
                <TableHead className="hidden lg:table-cell">Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Payment</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow
                  key={doc.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelectDocument(doc)}
                >
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selected.has(doc.id)} onCheckedChange={() => toggleOne(doc.id)} aria-label="Select row" />
                  </TableCell>
                  <TableCell className="font-mono text-xs font-medium">
                    {doc.doc_number || <span className="text-muted-foreground italic">Draft</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{doc.category}</Badge>
                  </TableCell>
                  <TableCell className="text-xs hidden md:table-cell">{doc.sub_type}</TableCell>
                  <TableCell className="text-xs hidden lg:table-cell">{doc.customer_name || '—'}</TableCell>
                  <TableCell className="text-right text-xs font-medium">GH₵ {Number(doc.total).toFixed(2)}</TableCell>
                  <TableCell className="text-center">
                    <Badge className={`text-[10px] ${STATUS_COLORS[doc.status] || ''}`}>{doc.status}</Badge>
                  </TableCell>
                  <TableCell className="text-center hidden sm:table-cell">
                    <Badge className={`text-[10px] ${PAYMENT_COLORS[doc.payment_status] || ''}`}>{doc.payment_status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs hidden md:table-cell">
                    {new Date(doc.created_at).toLocaleDateString('en-GB')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!bulkAction} onOpenChange={() => setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === 'delete'
                ? `Delete ${selected.size} document(s)?`
                : `Cancel ${selected.size} document(s)?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === 'delete'
                ? 'This permanently removes selected documents. This action cannot be undone.'
                : 'Selected documents will be marked as Cancelled. They remain visible for history.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={runBulk}
              className={bulkAction === 'delete' ? 'bg-destructive text-destructive-foreground' : ''}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
