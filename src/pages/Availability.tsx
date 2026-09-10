import { useMemo, useState } from 'react';
import { Search, Store, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useOutlets, useMyOutlet } from '@/hooks/useOutlets';
import { cn } from '@/lib/utils';
import { getOfflineMeta, setOfflineMeta } from '@/lib/offlineDb';
import { TableRowsSkeleton } from '@/components/LoadingSkeletons';

interface AvailabilityRow {
  product_id: string; product_name: string; category: string; uom: string; sales_price: number; expiry_date: string | null;
  total_qty: number; outlet_id: string; outlet_name: string; outlet_code: string; quantity: number; updated_at: string | null;
}

export default function Availability() {
  const [search, setSearch] = useState('');
  const { data: outlets = [] } = useOutlets();
  const { outletId: myOutletId } = useMyOutlet();
  const activeOutlets = outlets.filter(o => o.is_active);

  const { data: rows = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['availability', search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const cacheKey = `availability:${search.trim().toLowerCase()}`;
      if (!navigator.onLine) return (await getOfflineMeta<AvailabilityRow[]>(cacheKey)) || [];
      const { data, error } = await supabase.rpc('product_availability' as any, { p_search: search.trim() });
      if (error) throw error;
      const result = (data || []) as AvailabilityRow[];
      await setOfflineMeta(cacheKey, result);
      return result;
    },
  });

  const products = useMemo(() => {
    const map = new Map<string, { info: AvailabilityRow; byOutlet: Record<string, AvailabilityRow> }>();
    for (const r of rows) {
      if (!map.has(r.product_id)) map.set(r.product_id, { info: r, byOutlet: {} });
      map.get(r.product_id)!.byOutlet[r.outlet_id] = r;
    }
    return Array.from(map.values()).slice(0, 100);
  }, [rows]);

  const fmtCurrency = (n: number) => `GH₵ ${Number(n).toFixed(2)}`;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Drug availability</h1>
        <p className="text-sm text-muted-foreground">Search a drug and see how many are held at each outlet.</p>
      </div>

      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input autoFocus className="pl-9" placeholder="Search by drug name or category (min. 2 letters)" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {activeOutlets.length === 0 && (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">No outlets have been set up yet. Ask an administrator to add outlets first.</CardContent></Card>
      )}

      {activeOutlets.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Drug</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Expiry</TableHead>
                  {activeOutlets.map(o => (
                    <TableHead key={o.id} className={cn('text-center', o.id === myOutletId && 'text-primary')}>
                      <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" />{o.name}{o.id === myOutletId && ' (mine)'}</span>
                    </TableHead>
                  ))}
                  <TableHead className="text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {search.trim().length < 2 && <TableRow><TableCell colSpan={5 + activeOutlets.length} className="text-center text-muted-foreground py-10">Type a drug name to check availability</TableCell></TableRow>}
                {isLoading && <TableRowsSkeleton columns={5 + activeOutlets.length} />}
                {!isLoading && search.trim().length >= 2 && products.length === 0 && <TableRow><TableCell colSpan={5 + activeOutlets.length} className="text-center text-muted-foreground py-10">No matching drugs</TableCell></TableRow>}
                {products.map(({ info, byOutlet }) => (
                  <TableRow key={info.product_id}>
                    <TableCell>
                      <div className="font-medium">{info.product_name}</div>
                      <div className="text-xs text-muted-foreground">{info.category}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{info.uom}</TableCell>
                    <TableCell>{fmtCurrency(info.sales_price)}</TableCell>
                    <TableCell className="text-muted-foreground">{info.expiry_date ? format(new Date(info.expiry_date), 'dd/MM/yyyy') : '—'}</TableCell>
                    {activeOutlets.map(o => {
                      const r = byOutlet[o.id];
                      const qty = r?.quantity ?? 0;
                      return (
                        <TableCell key={o.id} className="text-center">
                          <Badge variant={qty > 0 ? 'default' : 'secondary'} className={cn(qty <= 0 && 'opacity-60')}>{qty}</Badge>
                          {r?.updated_at && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 inline-flex items-center gap-0.5 justify-center w-full" title={format(new Date(r.updated_at), 'dd/MM/yyyy HH:mm')}>
                              <Clock className="w-2.5 h-2.5" />{formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center font-semibold">{info.total_qty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {dataUpdatedAt > 0 && <p className="text-xs text-muted-foreground">Figures refreshed {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}. Offline devices will show last-known quantities.</p>}
    </div>
  );
}
