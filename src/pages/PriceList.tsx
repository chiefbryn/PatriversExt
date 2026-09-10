import { useState, useMemo } from 'react';
import { Search, Pencil, Check, X, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProductsRealtime, fetchAllProducts } from '@/hooks/useProducts';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { ContentSkeleton } from '@/components/LoadingSkeletons';

export default function PriceList() {
  useProductsRealtime();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editCost, setEditCost] = useState<number | ''>('');
  const [editPrice, setEditPrice] = useState<number | ''>('');
  const [editWholesale, setEditWholesale] = useState<number | ''>('');
  const [showWithPriceOnly, setShowWithPriceOnly] = useState(false);



  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetchAllProducts(),
  });

  const filtered = useMemo(() => {
    let list = products;
    if (showWithPriceOnly) {
      list = list.filter(p => Number(p.sales_price) > 0);
    }
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, search, showWithPriceOnly]);

  const startEdit = (p: any) => {
    setEditId(p.id);
    setEditCost(Number(p.cost_price));
    setEditPrice(Number(p.sales_price));
    setEditWholesale(Number(p.wholesale_price || 0));
  };

  const saveEdit = async () => {
    if (!editId) return;
    try {
      const { error } = await supabase.from('products').update({
        cost_price: typeof editCost === 'number' ? editCost : 0,
        sales_price: typeof editPrice === 'number' ? editPrice : 0,
        wholesale_price: typeof editWholesale === 'number' ? editWholesale : 0,
      }).eq('id', editId);
      if (error) throw error;
      toast.success('Price updated');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditId(null);
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    }
  };

  const margin = (cost: number, price: number) => cost > 0 ? (((price - cost) / cost) * 100).toFixed(1) : '—';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">Price list</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</span>
          <RecordsToolbar
            disabled={filtered.length === 0}
            getData={() => ({
              title: 'Price List',
              subtitle: `${filtered.length} product(s)`,
              filename: 'price_list',
              headers: ['#', 'Product', 'Category', 'Cost Price', 'Selling Price', 'Margin %'],
              alignRight: [3, 4, 5],
              rows: filtered.map((p, i) => [
                i + 1, p.name, p.category,
                Number(Number(p.cost_price).toFixed(2)),
                Number(Number(p.sales_price).toFixed(2)),
                margin(Number(p.cost_price), Number(p.sales_price)),
              ]),
            })}
          />
        </div>
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative max-w-md flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search products..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-input accent-primary"
            checked={showWithPriceOnly}
            onChange={e => setShowWithPriceOnly(e.target.checked)}
          />
          Only show items with price
        </label>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-0"><ContentSkeleton rows={7} /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No products in the price list.</CardContent></Card>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Cost Price</TableHead>
                <TableHead className="text-right">Retail Price</TableHead>
                <TableHead className="text-right">Wholesale Price</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.category}</TableCell>

                  <TableCell className="text-right">
                    {editId === p.id ? (
                      <Input type="number" min={0} step="0.01" value={editCost} onChange={e => setEditCost(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)} className="w-24 text-right text-xs h-8 inline-block" />
                    ) : `GH₵ ${Number(p.cost_price).toFixed(2)}`}
                  </TableCell>
                  <TableCell className="text-right">
                    {editId === p.id ? (
                      <Input type="number" min={0} step="0.01" value={editPrice} onChange={e => setEditPrice(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)} className="w-24 text-right text-xs h-8 inline-block" />
                    ) : `GH₵ ${Number(p.sales_price).toFixed(2)}`}
                  </TableCell>
                  <TableCell className="text-right">
                    {editId === p.id ? (
                      <Input type="number" min={0} step="0.01" value={editWholesale} onChange={e => setEditWholesale(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)} className="w-24 text-right text-xs h-8 inline-block" />
                    ) : Number(p.wholesale_price || 0) > 0 ? `GH₵ ${Number(p.wholesale_price).toFixed(2)}` : 'Not set'}
                  </TableCell>
                  <TableCell className="text-right">
                    {editId === p.id ? `${margin(typeof editCost === 'number' ? editCost : 0, typeof editPrice === 'number' ? editPrice : 0)}%` : `${margin(Number(p.cost_price), Number(p.sales_price))}%`}
                  </TableCell>
                  <TableCell>
                    {editId === p.id ? (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-accent" onClick={saveEdit}><Check className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditId(null)}><X className="w-3.5 h-3.5" /></Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)}><Pencil className="w-3.5 h-3.5" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
