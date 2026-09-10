import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface GRItem {
  doc_id: string;
  doc_number: string;
  date: string;
  supplier: string;
  sub_type: string;
  status: string;
  payment_status: string;
  product: string;
  uom: string;
  quantity: number;
  unit_price: number;
  amount: number;
  batch: string;
  expiry: string;
  external_ref: string;
}

function useGoodsReceived(from: string, to: string, allTime: boolean) {
  return useQuery({
    queryKey: ['goods-received', from, to, allTime],
    queryFn: async (): Promise<GRItem[]> => {
      const sel = (s: string): string => s;
      let q = supabase
        .from('documents')
        .select(sel('id, doc_number, created_at, period_date, customer_name, sub_type, status, payment_status, external_ref, document_items(quantity, unit_price, amount, batch_number, expiry_date, products(name, uom))'))
        .eq('category', 'Purchases');
      if (!allTime) {
        q = q.gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`);
      }
      const { data, error } = await q.order('created_at', { ascending: false }).limit(2000);
      if (error) throw error;

      const rows: GRItem[] = [];
      for (const d of (data as any[]) || []) {
        for (const it of d.document_items || []) {
          rows.push({
            doc_id: d.id,
            doc_number: d.doc_number || 'Draft',
            date: d.period_date || d.created_at,
            supplier: d.customer_name || '—',
            sub_type: d.sub_type || '—',
            status: d.status,
            payment_status: d.payment_status,
            product: it.products?.name || '—',
            uom: it.products?.uom || '—',
            quantity: Number(it.quantity) || 0,
            unit_price: Number(it.unit_price) || 0,
            amount: Number(it.amount) || 0,
            batch: it.batch_number || '—',
            expiry: it.expiry_date || '—',
            external_ref: d.external_ref || '—',
          });
        }
      }
      return rows;
    },
  });
}

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date().toISOString().slice(0, 8) + '01';

export default function GoodsReceived() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [allTime, setAllTime] = useState(false);
  const [search, setSearch] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // An invoice-number lookup always searches the full history, ignoring dates.
  const refActive = invoiceRef.trim().length > 0;
  const { data = [], isLoading } = useGoodsReceived(from, to, allTime || refActive);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ref = invoiceRef.trim().toLowerCase();
    return data.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (ref && !(`${r.external_ref} ${r.doc_number}`.toLowerCase().includes(ref))) return false;
      if (!q) return true;
      return [r.product, r.supplier, r.doc_number, r.external_ref, r.batch].some(v => (v || '').toLowerCase().includes(q));
    });
  }, [data, search, invoiceRef, statusFilter]);


  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalValue = rows.reduce((s, r) => s + r.amount, 0);
  const docCount = new Set(rows.map(r => r.doc_id)).size;
  const productCount = new Set(rows.map(r => r.product)).size;

  const headers = ['Date', 'Doc #', 'Invoice ref', 'Supplier', 'Product', 'UoM', 'Qty in', 'Unit cost', 'Value', 'Batch', 'Expiry', 'Status'];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Goods Received</h1>
          <p className="text-sm text-muted-foreground">Stock-in items received from suppliers</p>
        </div>
        <RecordsToolbar
          disabled={rows.length === 0}
          getData={() => ({
            title: 'Goods Received (Stock In)',
            subtitle: refActive ? `Invoice search: "${invoiceRef}" (all time)` : allTime ? 'All time' : `${from} to ${to}`,
            filename: 'goods_received',
            headers,
            alignRight: [6, 7, 8],
            rows: rows.map(r => [
              new Date(r.date).toLocaleDateString('en-GB'), r.doc_number, r.external_ref, r.supplier,
              r.product, r.uom, r.quantity, r.unit_price.toFixed(2), r.amount.toFixed(2),
              r.batch, r.expiry === '—' ? '—' : new Date(r.expiry).toLocaleDateString('en-GB'), r.status,
            ]),
            totalsRow: ['TOTALS', `${docCount} docs`, '', '', `${productCount} products`, '', totalQty, '', totalValue.toFixed(2), '', '', ''],
          })}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total qty received', value: String(totalQty) },
          { label: 'Total value', value: `GH₵ ${totalValue.toFixed(2)}` },
          { label: 'Documents', value: String(docCount) },
          { label: 'Products', value: String(productCount) },
        ].map(c => (
          <Card key={c.label} className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="text-lg font-semibold mt-1">{c.value}</p>
          </Card>
        ))}
      </div>

      {/* Invoice lookup — always searches the whole history */}
      <Card className="p-3 space-y-2">
        <p className="text-xs font-medium">Find by external invoice number</p>
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="e.g. INV-2231 (supplier invoice / doc no.)" value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} className="w-full sm:w-80" />
          {refActive && (
            <Button variant="outline" size="sm" onClick={() => setInvoiceRef('')}>Clear</Button>
          )}
          <span className="text-xs text-muted-foreground">
            {refActive ? `Searching all past documents — ${rows.length} line(s) found` : 'Searches every past document, ignoring the date range'}
          </span>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 items-center">
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} disabled={allTime || refActive} className="w-auto" />
        <Input type="date" value={to} onChange={e => setTo(e.target.value)} disabled={allTime || refActive} className="w-auto" />
        <Button variant={allTime ? 'default' : 'outline'} size="sm" onClick={() => setAllTime(v => !v)}>All time</Button>
        <Button variant="outline" size="sm" onClick={() => { setAllTime(false); setFrom(monthStart()); setTo(today()); }}>This month</Button>
        <Button variant="outline" size="sm" onClick={() => { setAllTime(false); setFrom(new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10)); setTo(today()); }}>Last 90 days</Button>
        <Button variant="outline" size="sm" onClick={() => { setAllTime(false); setFrom(`${new Date().getFullYear()}-01-01`); setTo(today()); }}>This year</Button>
        <Input placeholder="Search product, supplier, batch…" value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:w-72" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>


      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{headers.map(h => <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 5 }, (_, row) => (
              <tr key={row} className="border-t" aria-hidden="true">
                {headers.map((header, column) => <td key={`${header}-${column}`} className="px-3 py-3"><Skeleton className={column === 4 ? 'h-4 w-32' : 'h-4 w-20'} /></td>)}
              </tr>
            ))}
            {!isLoading && rows.length === 0 && <tr><td colSpan={headers.length} className="px-3 py-6 text-center text-muted-foreground">No goods received in this period.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(r.date).toLocaleDateString('en-GB')}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.doc_number}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.external_ref}</td>
                <td className="px-3 py-2">{r.supplier}</td>
                <td className="px-3 py-2">{r.product}</td>
                <td className="px-3 py-2">{r.uom}</td>
                <td className="px-3 py-2 text-right">{r.quantity}</td>
                <td className="px-3 py-2 text-right">GH₵ {r.unit_price.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">GH₵ {r.amount.toFixed(2)}</td>
                <td className="px-3 py-2">{r.batch}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.expiry === '—' ? '—' : new Date(r.expiry).toLocaleDateString('en-GB')}</td>
                <td className="px-3 py-2">{r.status}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-muted/50 font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={6}>TOTALS — {docCount} docs, {productCount} products</td>
                <td className="px-3 py-2 text-right">{totalQty}</td>
                <td />
                <td className="px-3 py-2 text-right">GH₵ {totalValue.toFixed(2)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
