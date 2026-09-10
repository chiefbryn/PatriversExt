import { useState, useMemo, useEffect } from 'react';
import { Package, AlertTriangle, XCircle, TrendingDown, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllProducts } from '@/hooks/useProducts';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { ContentSkeleton } from '@/components/LoadingSkeletons';


type StockFilter = 'all' | 'negative' | 'nonzero' | 'zero';

export default function Stock() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StockFilter>('all');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetchAllProducts(),
  });

  // Realtime
  useEffect(() => {
    const channel = supabase.channel('stock-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'negative': return products.filter(p => p.qty < 0);
      case 'zero': return products.filter(p => p.qty === 0);
      case 'nonzero': return products.filter(p => p.qty !== 0);
      default: return products;
    }
  }, [products, filter]);

  const totalSKUs = products.length;
  const inStock = products.filter(p => p.qty > 0).length;
  const lowStock = products.filter(p => p.qty > 0 && p.qty <= p.reorder_level).length;
  const outOfStock = products.filter(p => p.qty === 0).length;
  const negativeStock = products.filter(p => p.qty < 0).length;

  const SUMMARY = [
    { label: 'Total SKUs', value: String(totalSKUs), icon: Package },
    { label: 'Items in stock', value: String(inStock), icon: Package },
    { label: 'Low stock', value: String(lowStock), icon: AlertTriangle },
    { label: 'Out of stock', value: String(outOfStock), icon: XCircle },
    { label: 'Negative stock', value: String(negativeStock), icon: TrendingDown },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Stock</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {SUMMARY.map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <s.icon className="w-4 h-4 text-muted-foreground mb-1" />
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {(['negative', 'nonzero', 'zero'] as StockFilter[]).map(f => (
            <button key={f} onClick={() => setFilter(filter === f ? 'all' : f)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
              {f === 'negative' ? 'Negative quantity' : f === 'nonzero' ? 'Non-zero quantity' : 'Zero quantity'}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-2">Product count: {filtered.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => queryClient.invalidateQueries({ queryKey: ['products'] })}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <RecordsToolbar
            disabled={filtered.length === 0}
            getData={() => {
              const totalQty = filtered.reduce((s, p) => s + Number(p.qty || 0), 0);
              const totalCost = filtered.reduce((s, p) => s + Number(p.qty || 0) * Number(p.cost_price || 0), 0);
              const totalValue = filtered.reduce((s, p) => s + Number(p.qty || 0) * Number(p.sales_price || 0), 0);
              return {
                title: 'Stock Report',
                subtitle: `Filter: ${filter === 'all' ? 'All products' : filter} | ${filtered.length} items`,
                filename: 'stock_report',
                headers: ['#', 'Product', 'Category', 'UOM', 'Qty', 'Reorder', 'Status', 'Cost', 'Price', 'Expiry'],
                alignRight: [4, 5, 7, 8],
                rows: filtered.map((p, i) => [
                  i + 1, p.name, p.category, p.uom, Number(p.qty), Number(p.reorder_level),
                  p.qty < 0 ? 'Negative' : p.qty === 0 ? 'Out' : p.qty <= p.reorder_level ? 'Low' : 'OK',
                  Number(Number(p.cost_price).toFixed(2)), Number(Number(p.sales_price).toFixed(2)), p.expiry_date || '—',
                ]),
                totalsRow: [
                  'TOTAL', `${filtered.length} item(s)`, '', '', totalQty, '', '',
                  Number(totalCost.toFixed(2)), Number(totalValue.toFixed(2)), '',
                ],
              };
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-0"><ContentSkeleton rows={7} /></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No stock data matching filter.</CardContent></Card>
      ) : (
        <div className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Expiry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.category}</TableCell>
                  <TableCell>{p.uom}</TableCell>
                  <TableCell className="text-right">{p.qty}</TableCell>
                  <TableCell className="text-right">{p.reorder_level}</TableCell>
                  <TableCell>
                    {p.qty < 0 ? <Badge variant="destructive" className="text-[10px]">Negative</Badge> :
                     p.qty === 0 ? <Badge variant="destructive" className="text-[10px]">Out</Badge> :
                     p.qty <= p.reorder_level ? <Badge className="bg-warning text-warning-foreground text-[10px]">Low</Badge> :
                     <Badge className="bg-accent text-accent-foreground text-[10px]">OK</Badge>}
                  </TableCell>
                  <TableCell className="text-right">GH₵ {Number(p.cost_price).toFixed(2)}</TableCell>
                  <TableCell className="text-right">GH₵ {Number(p.sales_price).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">{p.expiry_date || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
