import { useState, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, Package, Upload, Ban, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { toast } from 'sonner';
import { useProducts, useDeleteProduct, useProductsRealtime, useBulkSetProductStatus, useBulkDeleteProducts, type Product } from '@/hooks/useProducts';
import { useAuth } from '@/hooks/useAuth';
import { ProductFormDialog } from '@/components/ProductFormDialog';
import { ImportProductsDialog } from '@/components/ImportProductsDialog';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { ContentSkeleton } from '@/components/LoadingSkeletons';

export default function Inventory() {
  useProductsRealtime();
  const { data: products = [], isLoading } = useProducts();
  const deleteMut = useDeleteProduct();
  const bulkStatusMut = useBulkSetProductStatus();
  const bulkDeleteMut = useBulkDeleteProducts();
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | 'block' | 'unblock' | 'delete'>(null);


  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.batch_number?.toLowerCase().includes(q) ||
      p.supplier_name?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const allChecked = filtered.length > 0 && filtered.every(p => selected.has(p.id));
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allChecked) filtered.forEach(p => next.delete(p.id));
      else filtered.forEach(p => next.add(p.id));
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

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMut.mutateAsync(deleteId);
      toast.success('Product deleted');
    } catch (err: any) {
      toast.error(err.message || 'Delete failed');
    }
    setDeleteId(null);
  };

  const runBulk = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      if (bulkAction === 'block') {
        await bulkStatusMut.mutateAsync({ ids, status: 'inactive' });
        toast.success(`${ids.length} product(s) blocked`);
      } else if (bulkAction === 'unblock') {
        await bulkStatusMut.mutateAsync({ ids, status: 'active' });
        toast.success(`${ids.length} product(s) reactivated`);
      } else if (bulkAction === 'delete') {
        await bulkDeleteMut.mutateAsync(ids);
        toast.success(`${ids.length} product(s) deleted`);
      }
      setSelected(new Set());
    } catch (err: any) {
      toast.error(err.message || 'Bulk action failed');
    }
    setBulkAction(null);
  };

  const stockBadge = (qty: number, reorder: number) => {
    if (qty <= 0) return <Badge variant="destructive" className="text-[10px]">Out</Badge>;
    if (qty <= reorder) return <Badge className="bg-warning text-warning-foreground text-[10px]">Low</Badge>;
    return <Badge className="bg-accent text-accent-foreground text-[10px]">OK</Badge>;
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-semibold">Inventory</h1>
        <div className="flex flex-wrap gap-2">
          <RecordsToolbar
            disabled={filtered.length === 0}
            getData={() => {
              const totalQty = filtered.reduce((s, p) => s + Number(p.qty || 0), 0);
              const totalCost = filtered.reduce((s, p) => s + Number(p.qty || 0) * Number(p.cost_price || 0), 0);
              const totalValue = filtered.reduce((s, p) => s + Number(p.qty || 0) * Number(p.sales_price || 0), 0);
              return {
                title: 'Inventory Report',
                subtitle: `${filtered.length} products`,
                filename: 'inventory_report',
                headers: ['#', 'Name', 'Category', 'UOM', 'Qty', 'Reorder', 'Stock', 'Cost', 'Price', 'Expiry', 'Batch', 'Supplier'],
                alignRight: [4, 5, 7, 8],
                rows: filtered.map((p, i) => [
                  i + 1, p.name, p.category, p.uom, Number(p.qty), Number(p.reorder_level),
                  p.qty <= 0 ? 'Out' : p.qty <= p.reorder_level ? 'Low' : 'OK',
                  Number(Number(p.cost_price).toFixed(2)), Number(Number(p.sales_price).toFixed(2)),
                  p.expiry_date || '—', p.batch_number || '—', p.supplier_name || '—',
                ]),
                totalsRow: [
                  'TOTAL', `${filtered.length} item(s)`, '', '', totalQty, '', '',
                  Number(totalCost.toFixed(2)), Number(totalValue.toFixed(2)), '', '', '',
                ],
              };
            }}
          />

          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" /> Import CSV
          </Button>
          <Button className="gap-2" onClick={() => { setEditProduct(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4" /> Add product
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 bg-accent/10 border border-accent/30 rounded-md px-3 py-2 flex-wrap">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <span className="flex-1" />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkAction('block')}>
            <Ban className="w-3.5 h-3.5" /> Block
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkAction('unblock')}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Unblock
          </Button>
          {isAdmin && (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => setBulkAction('delete')}>
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-0"><ContentSkeleton rows={7} /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            {products.length === 0 ? 'No products added yet. Click "Add product" to get started.' : 'No products match your search.'}
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-x-auto -mx-3 sm:mx-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => {
                const blocked = (p as any).status === 'inactive';
                return (
                  <TableRow key={p.id} className={blocked ? 'opacity-60' : ''}>
                    <TableCell>
                      <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleOne(p.id)} aria-label={`Select ${p.name}`} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.name}
                      {blocked && <Badge variant="outline" className="ml-2 text-[9px] border-destructive/40 text-destructive">Blocked</Badge>}
                    </TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell>{p.uom}</TableCell>
                    <TableCell className="text-right">{p.qty}</TableCell>
                    <TableCell>{stockBadge(p.qty, p.reorder_level)}</TableCell>
                    <TableCell className="text-right">GH₵ {Number(p.cost_price).toFixed(2)}</TableCell>
                    <TableCell className="text-right">GH₵ {Number(p.sales_price).toFixed(2)}</TableCell>
                    <TableCell className="text-xs">{p.expiry_date || '—'}</TableCell>
                    <TableCell className="text-xs">{p.batch_number || '—'}</TableCell>
                    <TableCell className="text-xs">{p.supplier_name || '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditProduct(p); setFormOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(p.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editProduct} />
      <ImportProductsDialog open={importOpen} onOpenChange={setImportOpen} />
      

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The product will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bulkAction} onOpenChange={() => setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === 'delete' ? `Delete ${selected.size} product(s)?`
                : bulkAction === 'block' ? `Block ${selected.size} product(s)?`
                : `Reactivate ${selected.size} product(s)?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === 'delete'
                ? 'This permanently removes the selected products. This action cannot be undone.'
                : bulkAction === 'block'
                ? 'Blocked products are hidden from POS and document pickers but kept for history.'
                : 'Reactivated products will appear in POS and pickers again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
