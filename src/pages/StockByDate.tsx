import { useState, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Search, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { printHTML } from '@/lib/printReport';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { ContentSkeleton } from '@/components/LoadingSkeletons';

import { useProductsRealtime } from '@/hooks/useProducts';

interface StockRow {
  productId: string;
  name: string;
  category: string;
  currentQty: number;
  openingStock: number;
  stockIn: number;
  stockOut: number;
  closingStock: number;
}

export default function StockByDate() {
  useProductsRealtime();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [queried, setQueried] = useState(false);
  const [search, setSearch] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '';

  // Use the user's local-day boundaries, then convert to ISO so Postgres
  // (timestamptz, stored in UTC) compares against the correct instant.
  const { dayStartISO, dayEndISO } = useMemo(() => {
    if (!selectedDate) return { dayStartISO: '', dayEndISO: '' };
    const start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);
    return { dayStartISO: start.toISOString(), dayEndISO: end.toISOString() };
  }, [selectedDate]);

  // Fetch all products (current quantities — used as the anchor for back-calc)
  const { data: products = [] } = useQuery({
    queryKey: ['sbd-products'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, category, qty')
        .order('name')
        .limit(10000);
      return data || [];
    },
  });

  // Movements that happened DURING the selected day
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['sbd-movements', dayStartISO, dayEndISO],
    enabled: queried && !!dayStartISO,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('product_id, movement_type, quantity, quantity_before, quantity_after, created_at')
        .gte('created_at', dayStartISO)
        .lte('created_at', dayEndISO)
        .order('created_at', { ascending: true })
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
  });

  // Movements that happened AFTER the selected day — used to back-calculate
  // closing stock from the product's CURRENT quantity. This is reliable even
  // when products have no historical movements (e.g. legacy seed stock).
  const { data: afterMovements = [] } = useQuery({
    queryKey: ['sbd-after-movements', dayEndISO],
    enabled: queried && !!dayEndISO,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('product_id, movement_type, quantity, quantity_before, quantity_after')
        .gt('created_at', dayEndISO)
        .limit(10000);
      if (error) throw error;
      return data || [];
    },
  });

  // Stored snapshot for the selected day (snapshot-first source of truth)
  const { data: snapshot = [] } = useQuery({
    queryKey: ['sbd-snapshot', dateStr],
    enabled: queried && !!dateStr,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('stock_snapshots')
        .select('product_id, quantity')
        .eq('snapshot_date', dateStr)
        .limit(10000);
      if (error) return [];
      return data || [];
    },
  });

  // Fetch company settings for print header
  const { data: company } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('*').limit(1).single();
      return data;
    },
  });

  // Signed delta of a single movement
  const signedDelta = (m: { movement_type: string; quantity: number; quantity_before: number; quantity_after: number }) => {
    if (m.movement_type === 'in') return m.quantity;
    if (m.movement_type === 'out') return -m.quantity;
    return m.quantity_after - m.quantity_before; // adjustment / set
  };

  const rows = useMemo<StockRow[]>(() => {
    if (!queried) return [];

    // Snapshot map: closing-stock-of-day per product (authoritative when present)
    const snapMap: Record<string, number> = {};
    snapshot.forEach((s: any) => { snapMap[s.product_id] = s.quantity; });

    // Net change AFTER the selected day per product (for back-calc fallback)
    const deltaAfter: Record<string, number> = {};
    afterMovements.forEach(m => {
      deltaAfter[m.product_id] = (deltaAfter[m.product_id] || 0) + signedDelta(m);
    });

    // Day movements per product, split into in / out for display
    const dayIn: Record<string, number> = {};
    const dayOut: Record<string, number> = {};
    movements.forEach(m => {
      const d = signedDelta(m);
      if (d > 0) dayIn[m.product_id] = (dayIn[m.product_id] || 0) + d;
      else if (d < 0) dayOut[m.product_id] = (dayOut[m.product_id] || 0) + Math.abs(d);
    });

    return products.map(p => {
      const sIn = dayIn[p.id] || 0;
      const sOut = dayOut[p.id] || 0;

      // Snapshot-first; fall back to back-calc against current qty
      const closingStock = snapMap[p.id] !== undefined
        ? snapMap[p.id]
        : p.qty - (deltaAfter[p.id] || 0);
      const openingStock = closingStock - sIn + sOut;

      return {
        productId: p.id,
        name: p.name,
        category: p.category,
        currentQty: p.qty,
        openingStock,
        stockIn: sIn,
        stockOut: sOut,
        closingStock,
      };
    });
  }, [products, movements, afterMovements, snapshot, queried]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
  }, [rows, search]);

  const totals = useMemo(() => ({
    opening: filtered.reduce((s, r) => s + r.openingStock, 0),
    stockIn: filtered.reduce((s, r) => s + r.stockIn, 0),
    stockOut: filtered.reduce((s, r) => s + r.stockOut, 0),
    closing: filtered.reduce((s, r) => s + r.closingStock, 0),
  }), [filtered]);

  const handlePrint = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title> </title>
      <style>
        @page { size: auto; margin: 0; }
        html, body { background:#fff; }
        body { font-family: Arial, sans-serif; margin: 14mm 12mm; color: #333; }
        .header { text-align: center; margin-bottom: 14px; border-bottom: 2px solid #333; padding-bottom: 8px; }
        .header h1 { margin: 0; font-size: 18px; }
        .header p { margin: 2px 0; font-size: 12px; color: #666; }
        .report-title { text-align: center; font-size: 16px; font-weight: bold; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
        .text-right { text-align: right; }
        tfoot td { font-weight: bold; background: #f4f4f4; border-top: 2px solid #333; }
        .footer { margin-top: 14px; text-align: center; font-size: 10px; color: #999; }
      </style></head><body>
      <div class="header">
        <h1>${company?.company_name || 'Patrivers Pharmacy'}</h1>
        ${company?.address ? `<p>${company.address}${company.city ? ', ' + company.city : ''}${company.region ? ', ' + company.region : ''}</p>` : ''}
        ${company?.phone_primary ? `<p>Tel: ${company.phone_primary}${company.phone_secondary ? ' / ' + company.phone_secondary : ''}</p>` : ''}
      </div>
      <div class="report-title">Stock Report as at ${selectedDate ? format(selectedDate, 'dd/MM/yyyy') : ''}</div>
      <table>
        <thead><tr>
          <th>#</th><th>Product Name</th><th>Category</th>
          <th class="text-right">Opening</th><th class="text-right">Stock In</th>
          <th class="text-right">Stock Out</th><th class="text-right">Closing</th>
        </tr></thead>
        <tbody>
          ${filtered.map((r, i) => `<tr>
            <td>${i + 1}</td><td>${r.name}</td><td>${r.category}</td>
            <td class="text-right">${r.openingStock}</td><td class="text-right">${r.stockIn}</td>
            <td class="text-right">${r.stockOut}</td><td class="text-right">${r.closingStock}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">TOTALS</td>
            <td class="text-right">${totals.opening}</td><td class="text-right">${totals.stockIn}</td>
            <td class="text-right">${totals.stockOut}</td><td class="text-right">${totals.closing}</td>
          </tr>
        </tfoot>
      </table>
      <div class="footer">Generated on ${format(new Date(), 'dd/MM/yyyy HH:mm')} | ${company?.company_name || 'Patrivers Pharmacy'}</div>
      </body></html>`;
    printHTML(html);
  };


  


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Stock by Date</h1>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Select Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[200px] justify-start text-left font-normal', !selectedDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => { setSelectedDate(d); setQueried(false); }}
                    disabled={(d) => d > new Date()}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={() => setQueried(true)} disabled={!selectedDate}>
              <FileText className="w-4 h-4 mr-1.5" /> Query Stock
            </Button>
            {queried && filtered.length > 0 && (
              <>
                <RecordsToolbar
                  disabled={filtered.length === 0}
                  getData={() => ({
                    title: `Stock Report as at ${dateStr}`,
                    subtitle: `${filtered.length} products`,
                    filename: `stock_by_date_${dateStr}`,
                    headers: ['#', 'Product Name', 'Category', 'Opening', 'Stock In', 'Stock Out', 'Closing'],
                    alignRight: [3, 4, 5, 6],
                    rows: filtered.map((r, i) => [i + 1, r.name, r.category, r.openingStock, r.stockIn, r.stockOut, r.closingStock]),
                    totalsRow: ['', 'TOTALS', '', totals.opening, totals.stockIn, totals.stockOut, totals.closing],
                  })}
                />
                <Button variant="ghost" size="sm" onClick={handlePrint} title="Legacy print">Legacy Print</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      {queried && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by product name or category..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <span className="text-xs text-muted-foreground">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Results */}
      {!queried ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          Select a date and click <strong>Query Stock</strong> to view stock levels for that day.
        </CardContent></Card>
      ) : isLoading ? (
        <Card><CardContent className="p-0"><ContentSkeleton rows={7} /></CardContent></Card>
      ) : (
        <div ref={printRef} className="border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Opening Stock</TableHead>
                <TableHead className="text-right">Stock In</TableHead>
                <TableHead className="text-right">Stock Out</TableHead>
                <TableHead className="text-right">Closing Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => (
                <TableRow key={r.productId}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell className="text-right">{r.openingStock}</TableCell>
                  <TableCell className={cn('text-right', r.stockIn > 0 && 'text-accent font-medium')}>{r.stockIn > 0 ? `+${r.stockIn}` : '0'}</TableCell>
                  <TableCell className={cn('text-right', r.stockOut > 0 && 'text-destructive font-medium')}>{r.stockOut > 0 ? `-${r.stockOut}` : '0'}</TableCell>
                  <TableCell className={cn('text-right font-medium', r.closingStock < 0 && 'text-destructive')}>{r.closingStock}</TableCell>
                </TableRow>
              ))}
              {filtered.length > 0 && (
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={3} className="font-bold">TOTALS</TableCell>
                  <TableCell className="text-right font-bold">{totals.opening}</TableCell>
                  <TableCell className="text-right font-bold text-accent">{totals.stockIn > 0 ? `+${totals.stockIn}` : '0'}</TableCell>
                  <TableCell className="text-right font-bold text-destructive">{totals.stockOut > 0 ? `-${totals.stockOut}` : '0'}</TableCell>
                  <TableCell className="text-right font-bold">{totals.closing}</TableCell>
                </TableRow>
              )}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No products found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
