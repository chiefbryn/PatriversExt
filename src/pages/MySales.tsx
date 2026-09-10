import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { TableRowsSkeleton } from '@/components/LoadingSkeletons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface SoldLine {
  time: string;
  invoice: string;
  product: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  payment_method: string;
}

const money = (n: number) => Number(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const timeFmt = (t: string) => (t ? new Date(t).toLocaleString('en-GB', { hour12: false }) : '—');

/** Cashier self-service sales list with date selection. */
export default function MySales() {
  const { user, profile } = useAuth() as any;
  const [date, setDate] = useState(today());
  const [toDate, setToDate] = useState(today());
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<SoldLine[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const start = `${date}T00:00:00.000Z`;
      const end = `${toDate}T23:59:59.999Z`;

      const { data: sales } = await supabase
        .from('sales')
        .select('id, invoice_number, created_at, payment_method')
        .eq('cashier_id', user.id)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false });

      const saleMap = new Map((sales || []).map((s: any) => [s.id, s]));
      const ids = Array.from(saleMap.keys());
      if (!ids.length) {
        if (!cancelled) { setLines([]); setLoading(false); }
        return;
      }

      const { data: items } = await supabase
        .from('sale_items')
        .select('sale_id, quantity, unit_price, line_total, products(name)')
        .in('sale_id', ids);

      const rows: SoldLine[] = (items || []).map((i: any) => {
        const s: any = saleMap.get(i.sale_id);
        return {
          time: s?.created_at ?? '',
          invoice: s?.invoice_number ?? '',
          product: i.products?.name ?? '—',
          quantity: Number(i.quantity || 0),
          unit_price: Number(i.unit_price || 0),
          line_total: Number(i.line_total || 0),
          payment_method: s?.payment_method ?? '',
        };
      }).sort((a, b) => (a.time < b.time ? 1 : -1));

      if (!cancelled) { setLines(rows); setLoading(false); }
    };

    load();

    const ch = supabase
      .channel(`my-sales-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user, date, toDate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = lines.filter(l => l.payment_method !== 'CEO Credit');
    return q ? base.filter(l => l.product.toLowerCase().includes(q) || l.invoice.toLowerCase().includes(q)) : base;
  }, [lines, search]);

  const creditLines = useMemo(() => lines.filter(l => l.payment_method === 'CEO Credit'), [lines]);

  const totalQty = filtered.reduce((s, l) => s + l.quantity, 0);
  const totalValue = filtered.reduce((s, l) => s + l.line_total, 0);
  const invoices = new Set(filtered.map(l => l.invoice)).size;
  const creditValue = creditLines.reduce((s, l) => s + l.line_total, 0);

  const setToday = () => { setDate(today()); setToDate(today()); };
  const setYesterday = () => {
    const d = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    setDate(d); setToDate(d);
  };
  const setLast7 = () => {
    setDate(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
    setToDate(today());
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold">My Sales</h1>
        <p className="text-xs text-muted-foreground">
          {profile?.full_name || 'Me'} • everything you sold on the selected date(s)
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-md border p-3 bg-card"><p className="text-xs text-muted-foreground">Receipts</p><p className="text-2xl font-bold">{invoices}</p></div>
        <div className="rounded-md border p-3 bg-card"><p className="text-xs text-muted-foreground">Items sold</p><p className="text-2xl font-bold">{totalQty}</p></div>
        <div className="rounded-md border p-3 bg-card"><p className="text-xs text-muted-foreground">Total sales</p><p className="text-2xl font-bold text-primary">GH₵ {money(totalValue)}</p></div>
        <div className="rounded-md border p-3 bg-card"><p className="text-xs text-muted-foreground">CEO credit (not sales)</p><p className="text-2xl font-bold text-amber-500">GH₵ {money(creditValue)}</p></div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" value={date} max={toDate} onChange={(e) => setDate(e.target.value)} className="w-[160px]" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" value={toDate} min={date} max={today()} onChange={(e) => setToDate(e.target.value)} className="w-[160px]" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={setToday}>Today</Button>
          <Button variant="outline" size="sm" onClick={setYesterday}>Yesterday</Button>
          <Button variant="outline" size="sm" onClick={setLast7}>Last 7 days</Button>
        </div>
        <Input
          placeholder="Search product or invoice…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <RecordsToolbar
          disabled={!filtered.length}
          className="ml-auto"
          getData={() => ({
            title: 'My Sales',
            subtitle: `${profile?.full_name || ''} • ${date}${toDate !== date ? ` to ${toDate}` : ''}`,
            filename: `my-sales-${date}${toDate !== date ? `-to-${toDate}` : ''}`,
            headers: ['Time', 'Invoice', 'Product', 'Qty', 'Unit Price', 'Line Total', 'Payment'],
            rows: filtered.map(l => [timeFmt(l.time), l.invoice, l.product, l.quantity, l.unit_price, l.line_total, l.payment_method]),
            alignRight: [3, 4, 5],
            totalsRow: ['', '', 'TOTAL', totalQty, '', totalValue, ''],
          })}
        />
      </div>

      <div className="border rounded-md overflow-auto max-h-[60vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Line Total</TableHead>
              <TableHead>Payment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRowsSkeleton columns={7} />
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No sales found for this date.</TableCell></TableRow>
            ) : (
              filtered.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap text-xs">{timeFmt(l.time)}</TableCell>
                  <TableCell className="text-xs">{l.invoice}</TableCell>
                  <TableCell className="font-medium">{l.product}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(l.unit_price)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{money(l.line_total)}</TableCell>
                  <TableCell className="text-xs">{l.payment_method}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
