import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { cn } from '@/lib/utils';
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, FileText, DollarSign, Package, Users, Activity, Wallet, Building2, Lightbulb, Printer } from 'lucide-react';
import { printReport, printHTML } from '@/lib/printReport';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { ContentSkeleton } from '@/components/LoadingSkeletons';
import {
  DateRange, getDateBounds,
  useSalesReport, useSaleItemsReport, useDocumentsReport,
  usePaymentsReport, useStockMovementsReport, useActivityReport,
  useProductsReport, useProfilesReport,
} from '@/hooks/useReports';
import {
  ProductInsights, ExpenseInsights, ProfitInsights,
  PaymentInsights, StockInsights,
} from '@/components/reports/InsightCharts';

const REPORT_GROUPS = [
  {
    label: 'Sales',
    icon: DollarSign,
    items: ['Daily sales', 'Sales trends', 'Invoice list', 'Products sold', 'Product groups', 'Profit margins'],
  },
  {
    label: 'Staff',
    icon: Users,
    items: ['Expenses by user', 'Collections by user'],
  },
  {
    label: 'Expenses',
    icon: Building2,
    items: ['All expenses', 'Expense by type'],
  },
  {
    label: 'Financials',
    icon: Wallet,
    items: ['Profit summary', 'Payment report', 'Outstanding balances'],
  },
  {
    label: 'Stock',
    icon: Package,
    items: ['Stock levels', 'Stock movements', 'Goods received', 'Expiry tracking'],
  },
  {
    label: 'Activity',
    icon: Activity,
    items: ['Activity log', 'Document audit'],
  },
  {
    label: 'Insights',
    icon: Lightbulb,
    items: ['Product insights', 'Expense insights', 'Profit insights', 'Payment insights', 'Stock insights'],
  },
];
const ALL_REPORTS = REPORT_GROUPS.flatMap(g => g.items);

// Reports that need each data source
const NEEDS_SALES = ['Daily sales', 'Sales trends', 'Invoice list', 'Products sold', 'Product groups', 'Profit margins', 'Profit summary', 'Product insights', 'Profit insights', 'Collections by user'];
const NEEDS_SALE_ITEMS = ['Products sold', 'Product groups', 'Profit margins', 'Product insights'];
const NEEDS_DOCUMENTS = ['All expenses', 'Expense by type', 'Profit summary', 'Outstanding balances', 'Document audit', 'Expense insights', 'Profit insights', 'Expenses by user', 'Goods received'];
const NEEDS_PAYMENTS = ['Payment report', 'Outstanding balances', 'Payment insights', 'Collections by user'];
const NEEDS_STOCK_MOVEMENTS = ['Stock movements', 'Stock insights'];
const NEEDS_PRODUCTS = ['Stock levels', 'Expiry tracking', 'Stock insights'];
const NEEDS_ACTIVITY = ['Activity log'];
const NEEDS_PROFILES = ['Activity log', 'Expenses by user', 'Collections by user', 'Products sold'];

export default function Reports() {
  const [active, setActive] = useState('Daily sales');
  const [range, setRange] = useState<DateRange>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [generated, setGenerated] = useState(true);
  const [productSearch, setProductSearch] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);

  const handlePrintReport = () => {
    const node = reportRef.current;
    if (!node) return;
    // Pull the page's stylesheets so charts/tables look the same
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML)
      .join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title> </title>
      ${styles}
      <style>
        /* Suppress browser-injected page header/footer (URL, date, title) */
        @page { size: auto; margin: 0; }
        html, body { background:#fff !important; color:#000 !important; }
        body { padding:14mm 12mm; font-family: Arial, sans-serif; }
        /* Hide on-screen-only widgets — totals live at the bottom of each table instead */
        .no-print, .summary-cards, button { display:none !important; }
        /* Make tfoot totals stand out in print */
        tfoot td, tfoot th { font-weight: 700 !important; border-top: 2px solid #333 !important; background:#f4f4f4 !important; }
        thead { display: table-header-group; }
        tfoot { display: table-row-group; }
        tr { page-break-inside: avoid; }
      </style>
    </head><body>
      <h1 style="font-size:18px;margin:0 0 4px 0;">${active}</h1>
      <p style="font-size:11px;color:#555;margin:0 0 12px 0;">Range: ${from} → ${to}</p>
      ${node.innerHTML}
    </body></html>`;
    printHTML(html);
  };



  const { from, to } = useMemo(() => getDateBounds(range, customFrom, customTo), [range, customFrom, customTo]);

  // Auto-generate when range or active report changes (except custom needs explicit generate)
  const handleRangeChange = (newRange: DateRange) => {
    setRange(newRange);
    if (newRange !== 'custom') setGenerated(true);
    else setGenerated(false);
  };

  const handleActiveChange = (report: string) => {
    setActive(report);
    if (range !== 'custom') setGenerated(true);
  };

  // Branch (outlet) filter — CEO and admins can scope reports to one branch
  const [branchId, setBranchId] = useState('all');
  const { data: outlets = [] } = useQuery({
    queryKey: ['reports-outlets'],
    queryFn: async () => {
      const { data } = await supabase.from('outlets').select('id, name, code').eq('is_active', true).order('sort_order');
      return (data || []) as { id: string; name: string; code: string }[];
    },
  });

  // Data hooks
  const { data: rawSales = [], isLoading: salesLoading } = useSalesReport(from, to, generated && NEEDS_SALES.includes(active));
  const { data: rawDocuments = [], isLoading: docsLoading } = useDocumentsReport(from, to, generated && NEEDS_DOCUMENTS.includes(active));
  const { data: rawPayments = [], isLoading: paymentsLoading } = usePaymentsReport(from, to, generated && NEEDS_PAYMENTS.includes(active));
  const { data: rawMovements = [], isLoading: smLoading } = useStockMovementsReport(from, to, generated && NEEDS_STOCK_MOVEMENTS.includes(active));
  const { data: products = [] } = useProductsReport(generated && NEEDS_PRODUCTS.includes(active));
  const { data: activityLogs = [], isLoading: actLoading } = useActivityReport(from, to, generated && NEEDS_ACTIVITY.includes(active));
  const { data: profiles = [] } = useProfilesReport(generated && NEEDS_PROFILES.includes(active));

  // Apply branch filter to everything that carries an outlet_id
  const byBranch = <T extends { outlet_id?: string | null }>(rows: T[]) =>
    branchId === 'all' ? rows : rows.filter(r => r.outlet_id === branchId);
  const salesData = useMemo(() => byBranch(rawSales), [rawSales, branchId]);
  const documents = useMemo(() => byBranch(rawDocuments), [rawDocuments, branchId]);
  const payments = useMemo(() => byBranch(rawPayments), [rawPayments, branchId]);
  const stockMovements = useMemo(() => byBranch(rawMovements), [rawMovements, branchId]);

  const saleIds = useMemo(() => salesData.map(s => s.id), [salesData]);
  const { data: saleItems = [] } = useSaleItemsReport(saleIds, generated && NEEDS_SALE_ITEMS.includes(active));

  const getStaffName = (uid: string) => profiles.find(p => p.user_id === uid)?.full_name || uid.slice(0, 8) + '…';
  const isLoading = salesLoading || docsLoading || paymentsLoading || smLoading || actLoading;

  const expenseDocs = useMemo(() => documents.filter(d => d.category === 'Expenses'), [documents]);

  const handleGenerate = () => setGenerated(true);

  const renderReport = () => {
    if (!generated) return (
      <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
        <BarChart3 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
        Select a report type and date range, then click <strong>Generate</strong>.
      </CardContent></Card>
    );
    if (isLoading) return <Card><CardContent className="p-0"><ContentSkeleton rows={7} /></CardContent></Card>;

    // ── SALES REPORTS ──
    if (active === 'Daily sales') {
      const grouped = salesData.reduce((acc, s) => {
        const day = new Date(s.created_at).toLocaleDateString('en-GB');
        if (!acc[day]) acc[day] = { total: 0, count: 0, discount: 0 };
        acc[day].total += Number(s.total);
        acc[day].count += 1;
        acc[day].discount += Number(s.discount);
        return acc;
      }, {} as Record<string, { total: number; count: number; discount: number }>);
      const entries = Object.entries(grouped);
      const totalRevenue = salesData.reduce((s, r) => s + Number(r.total), 0);
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Revenue', value: `GH₵ ${totalRevenue.toFixed(2)}`, accent: true },
            { label: 'Transactions', value: String(salesData.length) },
            { label: 'Avg per Day', value: `GH₵ ${entries.length ? (totalRevenue / entries.length).toFixed(2) : '0.00'}` },
          ]} />
          <ExportButton title={active} filename={'daily_sales'} headers={['Date', 'Transactions', 'Discounts', 'Total']} rows={entries.map(([d, v]) => [d, String(v.count), v.discount.toFixed(2), v.total.toFixed(2)])} />
          <DataTable headers={['Date', 'Transactions', 'Discounts', 'Total Sales']} alignRight={[1, 2, 3]}
            rows={entries.map(([day, d]) => [day, String(d.count), `GH₵ ${d.discount.toFixed(2)}`, `GH₵ ${d.total.toFixed(2)}`])}
            totalsRow={['TOTALS', String(salesData.length), `GH₵ ${entries.reduce((s, [, v]) => s + v.discount, 0).toFixed(2)}`, `GH₵ ${totalRevenue.toFixed(2)}`]}
            emptyText="No sales for this period." />
        </div>
      );
    }

    if (active === 'Sales trends') {
      const daily = salesData.reduce((acc, s) => {
        const day = new Date(s.created_at).toLocaleDateString('en-GB');
        acc[day] = (acc[day] || 0) + Number(s.total);
        return acc;
      }, {} as Record<string, number>);
      const days = Object.entries(daily).reverse();
      const maxVal = Math.max(...days.map(d => d[1]), 1);
      return (
        <div className="space-y-4">
          <SummaryCards items={[
            { label: 'Peak Day', value: days.length > 0 ? days.reduce((a, b) => a[1] > b[1] ? a : b)[0] : '—', sub: days.length > 0 ? `GH₵ ${days.reduce((a, b) => a[1] > b[1] ? a : b)[1].toFixed(2)}` : '', accent: true },
            { label: 'Lowest Day', value: days.length > 0 ? days.reduce((a, b) => a[1] < b[1] ? a : b)[0] : '—', sub: days.length > 0 ? `GH₵ ${days.reduce((a, b) => a[1] < b[1] ? a : b)[1].toFixed(2)}` : '', destructive: true },
            { label: 'Daily Average', value: `GH₵ ${days.length ? (days.reduce((s, d) => s + d[1], 0) / days.length).toFixed(2) : '0.00'}` },
          ]} />
          <Card><CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium mb-3">Sales by Day</p>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {days.map(([day, val]) => (
                <div key={day} className="flex items-center gap-3 text-xs">
                  <span className="w-20 text-muted-foreground shrink-0">{day}</span>
                  <div className="flex-1 h-5 bg-secondary rounded overflow-hidden">
                    <div className="h-full bg-accent rounded transition-all" style={{ width: `${(val / maxVal) * 100}%` }} />
                  </div>
                  <span className="w-24 text-right font-medium">GH₵ {val.toFixed(2)}</span>
                </div>
              ))}
              {days.length === 0 && <p className="text-center text-muted-foreground py-6">No data.</p>}
            </div>
          </CardContent></Card>
        </div>
      );
    }

    if (active === 'Invoice list') {
      return (
        <>
          <ExportButton title={active} filename={'invoices'} headers={['Invoice', 'Customer', 'Payment', 'Subtotal', 'Discount', 'Total', 'Status', 'Date']} rows={salesData.map(s => [s.invoice_number, s.customer_name || '', s.payment_method, Number(s.subtotal).toFixed(2), Number(s.discount).toFixed(2), Number(s.total).toFixed(2), s.status, new Date(s.created_at).toLocaleDateString('en-GB')])} />
          <DataTable headers={['Invoice', 'Customer', 'Payment', 'Subtotal', 'Discount', 'Total', 'Status', 'Date']} alignRight={[3, 4, 5]}
            rows={salesData.map(s => [s.invoice_number, s.customer_name || 'Walk-in', s.payment_method, `GH₵ ${Number(s.subtotal).toFixed(2)}`, `GH₵ ${Number(s.discount).toFixed(2)}`, `GH₵ ${Number(s.total).toFixed(2)}`, s.status, new Date(s.created_at).toLocaleDateString('en-GB')])}
            totalsRow={['TOTALS', '', '', `GH₵ ${salesData.reduce((s, r) => s + Number(r.subtotal), 0).toFixed(2)}`, `GH₵ ${salesData.reduce((s, r) => s + Number(r.discount), 0).toFixed(2)}`, `GH₵ ${salesData.reduce((s, r) => s + Number(r.total), 0).toFixed(2)}`, '', `${salesData.length} invoices`]}
            statusCol={6} emptyText="No invoices for this period." />
        </>
      );
    }

    if (active === 'Products sold') {
      const productSales = saleItems.reduce<Record<string, { qty: number; revenue: number }>>((acc, si) => {
        const name = (si as any).products?.name || 'Unknown';
        if (!acc[name]) acc[name] = { qty: 0, revenue: 0 };
        acc[name].qty += si.quantity;
        acc[name].revenue += Number(si.line_total);
        return acc;
      }, {});
      const all = Object.entries(productSales).sort((a, b) => b[1].revenue - a[1].revenue);
      const term = productSearch.trim().toLowerCase();
      const sorted = term ? all.filter(([n]) => n.toLowerCase().includes(term)) : all;

      // Per-line detail (who sold it & when) — shown when the user searches
      const saleMap = new Map(salesData.map(s => [s.id, s]));
      const lineDetails = term
        ? saleItems
            .filter(si => ((si as any).products?.name || 'Unknown').toLowerCase().includes(term))
            .map(si => {
              const sale = saleMap.get((si as any).sale_id) as any;
              return {
                when: sale?.created_at ? new Date(sale.created_at) : null,
                invoice: sale?.invoice_number || '—',
                product: (si as any).products?.name || 'Unknown',
                qty: si.quantity,
                unit: Number(si.unit_price),
                total: Number(si.line_total),
                cashier: sale?.cashier_id ? getStaffName(sale.cashier_id) : '—',
              };
            })
            .sort((a, b) => (b.when?.getTime() || 0) - (a.when?.getTime() || 0))
        : [];

      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap no-print">
            <Input
              placeholder="Search product…"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              className="max-w-xs h-9"
            />
            <span className="text-xs text-muted-foreground">
              {sorted.length} of {all.length} product{all.length !== 1 ? 's' : ''}
              {term && ` · ${lineDetails.length} sale${lineDetails.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <ExportButton title={active} filename={'products_sold'} headers={['#', 'Product', 'Qty Sold', 'Revenue']} rows={sorted.map(([n, d], i) => [String(i + 1), n, String(d.qty), d.revenue.toFixed(2)])} />
          <DataTable headers={['#', 'Product', 'Qty Sold', 'Revenue']} alignRight={[2, 3]}
            rows={sorted.map(([name, d], i) => [String(i + 1), name, String(d.qty), `GH₵ ${d.revenue.toFixed(2)}`])}
            totalsRow={['', 'TOTALS', String(sorted.reduce((s, [, d]) => s + d.qty, 0)), `GH₵ ${sorted.reduce((s, [, d]) => s + d.revenue, 0).toFixed(2)}`]}
            emptyText={term ? 'No products match your search.' : 'No products sold.'} />

          {term && lineDetails.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold pt-2">Sale Details — who sold it & when</p>
              <ExportButton
                title={`${active} — Details`}
                filename={'products_sold_details'}
                headers={['Date', 'Time', 'Invoice', 'Product', 'Qty', 'Unit Price', 'Total', 'Sold By']}
                rows={lineDetails.map(l => [
                  l.when ? l.when.toLocaleDateString('en-GB') : '',
                  l.when ? l.when.toLocaleTimeString('en-GB') : '',
                  l.invoice, l.product, String(l.qty), l.unit.toFixed(2), l.total.toFixed(2), l.cashier,
                ])}
              />
              <DataTable
                headers={['Date / Time', 'Invoice', 'Product', 'Qty', 'Unit Price', 'Total', 'Sold By']}
                alignRight={[3, 4, 5]}
                rows={lineDetails.map(l => [
                  l.when ? `${l.when.toLocaleDateString('en-GB')} ${l.when.toLocaleTimeString('en-GB')}` : '—',
                  l.invoice,
                  l.product,
                  String(l.qty),
                  `GH₵ ${l.unit.toFixed(2)}`,
                  `GH₵ ${l.total.toFixed(2)}`,
                  l.cashier,
                ])}
                totalsRow={['', '', 'TOTALS',
                  String(lineDetails.reduce((s, l) => s + l.qty, 0)),
                  '',
                  `GH₵ ${lineDetails.reduce((s, l) => s + l.total, 0).toFixed(2)}`,
                  '',
                ]}
                emptyText="No sales found."
              />
            </div>
          )}
        </div>
      );
    }


    if (active === 'Product groups') {
      const catSales = saleItems.reduce<Record<string, { qty: number; revenue: number; items: number }>>((acc, si) => {
        const cat = (si as any).products?.category || 'Uncategorized';
        if (!acc[cat]) acc[cat] = { qty: 0, revenue: 0, items: 0 };
        acc[cat].qty += si.quantity;
        acc[cat].revenue += Number(si.line_total);
        acc[cat].items += 1;
        return acc;
      }, {});
      const sorted = Object.entries(catSales).sort((a, b) => b[1].revenue - a[1].revenue);
      const totalRev = sorted.reduce((s, [, d]) => s + d.revenue, 0);
      return (
        <DataTable headers={['Category', 'Items Sold', 'Qty', 'Revenue', '% of Total']} alignRight={[1, 2, 3, 4]}
          rows={sorted.map(([cat, d]) => [cat, String(d.items), String(d.qty), `GH₵ ${d.revenue.toFixed(2)}`, `${totalRev > 0 ? ((d.revenue / totalRev) * 100).toFixed(1) : 0}%`])}
          totalsRow={['TOTALS', String(sorted.reduce((s, [, d]) => s + d.items, 0)), String(sorted.reduce((s, [, d]) => s + d.qty, 0)), `GH₵ ${totalRev.toFixed(2)}`, '100%']}
          emptyText="No data." />
      );
    }

    if (active === 'Profit margins') {
      const productProfit = saleItems.reduce<Record<string, { revenue: number; cost: number; qty: number }>>((acc, si) => {
        const prod = (si as any).products;
        const name = prod?.name || 'Unknown';
        const costPrice = Number(prod?.cost_price || 0);
        if (!acc[name]) acc[name] = { revenue: 0, cost: 0, qty: 0 };
        acc[name].revenue += Number(si.line_total);
        acc[name].cost += costPrice * si.quantity;
        acc[name].qty += si.quantity;
        return acc;
      }, {});
      const sorted = Object.entries(productProfit).sort((a, b) => (b[1].revenue - b[1].cost) - (a[1].revenue - a[1].cost));
      const totalRevenue = sorted.reduce((s, [, d]) => s + d.revenue, 0);
      const totalCost = sorted.reduce((s, [, d]) => s + d.cost, 0);
      const totalProfit = totalRevenue - totalCost;
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Revenue', value: `GH₵ ${totalRevenue.toFixed(2)}` },
            { label: 'Total Cost', value: `GH₵ ${totalCost.toFixed(2)}`, destructive: true },
            { label: 'Gross Profit', value: `GH₵ ${totalProfit.toFixed(2)}`, accent: totalProfit >= 0, destructive: totalProfit < 0, sub: `${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}% margin` },
          ]} />
          <DataTable headers={['Product', 'Qty', 'Revenue', 'Cost', 'Profit', 'Margin %']} alignRight={[1, 2, 3, 4, 5]}
            rows={sorted.map(([name, d]) => {
              const profit = d.revenue - d.cost;
              const margin = d.revenue > 0 ? (profit / d.revenue) * 100 : 0;
              return [name, String(d.qty), `GH₵ ${d.revenue.toFixed(2)}`, `GH₵ ${d.cost.toFixed(2)}`, `GH₵ ${profit.toFixed(2)}`, `${margin.toFixed(1)}%`];
            })}
            totalsRow={['TOTALS', String(sorted.reduce((s, [, d]) => s + d.qty, 0)), `GH₵ ${totalRevenue.toFixed(2)}`, `GH₵ ${totalCost.toFixed(2)}`, `GH₵ ${totalProfit.toFixed(2)}`, `${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%`]}
            emptyText="No profit data." />
        </div>
      );
    }


    // ── EXPENSE REPORTS ──
    if (active === 'All expenses') {
      const totalExpenses = expenseDocs.reduce((s, d) => s + Number(d.total), 0);
      const paidExpenses = expenseDocs.reduce((s, d) => s + Number(d.amount_paid), 0);
      const pendingExpenses = totalExpenses - paidExpenses;
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Expenses', value: `GH₵ ${totalExpenses.toFixed(2)}`, destructive: true },
            { label: 'Paid', value: `GH₵ ${paidExpenses.toFixed(2)}`, accent: true },
            { label: 'Pending', value: `GH₵ ${pendingExpenses.toFixed(2)}` },
            { label: 'Documents', value: String(expenseDocs.length) },
          ]} />
          <ExportButton title={active} filename={'expenses'} headers={['Doc #', 'Type', 'Customer', 'Total', 'Paid', 'Balance', 'Status', 'Date']} rows={expenseDocs.map(d => [d.doc_number || 'Draft', d.sub_type, d.customer_name || '', Number(d.total).toFixed(2), Number(d.amount_paid).toFixed(2), Number(d.balance_due).toFixed(2), d.payment_status, new Date(d.created_at).toLocaleDateString('en-GB')])} />
          <DataTable headers={['Doc #', 'Type', 'Customer/Vendor', 'Total', 'Paid', 'Balance', 'Payment', 'Status', 'Date']} alignRight={[3, 4, 5]}
            rows={expenseDocs.map(d => [
              d.doc_number || 'Draft', d.sub_type, d.customer_name || '—',
              `GH₵ ${Number(d.total).toFixed(2)}`, `GH₵ ${Number(d.amount_paid).toFixed(2)}`, `GH₵ ${Number(d.balance_due).toFixed(2)}`,
              d.payment_status, d.status, new Date(d.created_at).toLocaleDateString('en-GB'),
            ])}
            totalsRow={['TOTALS', `${expenseDocs.length} docs`, '', `GH₵ ${totalExpenses.toFixed(2)}`, `GH₵ ${paidExpenses.toFixed(2)}`, `GH₵ ${pendingExpenses.toFixed(2)}`, '', '', '']}
            statusCol={7} paymentStatusCol={6} emptyText="No expenses for this period." />
        </div>
      );
    }

    if (active === 'Expense by type') {
      const byType = expenseDocs.reduce((acc, d) => {
        const type = d.sub_type;
        if (!acc[type]) acc[type] = { total: 0, paid: 0, count: 0 };
        acc[type].total += Number(d.total);
        acc[type].paid += Number(d.amount_paid);
        acc[type].count += 1;
        return acc;
      }, {} as Record<string, { total: number; paid: number; count: number }>);
      const sorted = Object.entries(byType).sort((a, b) => (b[1] as any).total - (a[1] as any).total);
      const grandTotal = sorted.reduce((s, [, d]) => s + (d as any).total, 0);
      return (
        <div className="space-y-3">
          <Card><CardContent className="pt-4 pb-4">
            <p className="text-sm font-medium mb-3">Expense Distribution</p>
            <div className="space-y-2">
              {sorted.map(([type, rawD]) => {
                const d = rawD as { total: number; paid: number; count: number };
                return (
                <div key={type} className="flex items-center gap-3 text-xs">
                  <span className="w-36 truncate text-muted-foreground shrink-0">{type}</span>
                  <div className="flex-1 h-5 bg-secondary rounded overflow-hidden">
                    <div className="h-full bg-destructive/60 rounded transition-all" style={{ width: `${grandTotal > 0 ? (d.total / grandTotal) * 100 : 0}%` }} />
                  </div>
                  <span className="w-28 text-right font-medium">GH₵ {d.total.toFixed(2)}</span>
                  <span className="w-12 text-right text-muted-foreground">{grandTotal > 0 ? ((d.total / grandTotal) * 100).toFixed(0) : 0}%</span>
                </div>
                );
              })}
            </div>
          </CardContent></Card>
          <DataTable headers={['Expense Type', 'Count', 'Total', 'Paid', 'Outstanding', '% of Total']} alignRight={[1, 2, 3, 4, 5]}
            rows={sorted.map(([type, rawD]) => { const d = rawD as { total: number; paid: number; count: number }; return [type, String(d.count), `GH₵ ${d.total.toFixed(2)}`, `GH₵ ${d.paid.toFixed(2)}`, `GH₵ ${(d.total - d.paid).toFixed(2)}`, `${grandTotal > 0 ? ((d.total / grandTotal) * 100).toFixed(1) : 0}%`]; })}
            totalsRow={(() => { const tCount = sorted.reduce((s, [, r]) => s + (r as any).count, 0); const tPaid = sorted.reduce((s, [, r]) => s + (r as any).paid, 0); return ['TOTALS', String(tCount), `GH₵ ${grandTotal.toFixed(2)}`, `GH₵ ${tPaid.toFixed(2)}`, `GH₵ ${(grandTotal - tPaid).toFixed(2)}`, '100%']; })()}
            emptyText="No expenses for this period." />
        </div>
      );
    }

    // ── FINANCIAL REPORTS ──
    if (active === 'Profit summary') {
      const totalSales = salesData.reduce((s, r) => s + Number(r.total), 0);
      const totalExpenses = expenseDocs.filter(d => d.status !== 'voided').reduce((s, d) => s + Number(d.total), 0);
      const netProfit = totalSales - totalExpenses;
      const margin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

      // Monthly breakdown
      const monthly: Record<string, { sales: number; expenses: number }> = {};
      salesData.forEach(s => {
        const m = new Date(s.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });
        if (!monthly[m]) monthly[m] = { sales: 0, expenses: 0 };
        monthly[m].sales += Number(s.total);
      });
      expenseDocs.filter(d => d.status !== 'voided').forEach(d => {
        const m = new Date(d.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });
        if (!monthly[m]) monthly[m] = { sales: 0, expenses: 0 };
        monthly[m].expenses += Number(d.total);
      });
      const monthEntries = Object.entries(monthly);

      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Sales', value: `GH₵ ${totalSales.toFixed(2)}`, accent: true },
            { label: 'Total Expenses', value: `GH₵ ${totalExpenses.toFixed(2)}`, destructive: true },
            { label: 'Net Profit', value: `GH₵ ${netProfit.toFixed(2)}`, accent: netProfit >= 0, destructive: netProfit < 0, sub: `${margin.toFixed(1)}% margin` },
          ]} />
          <ExportButton title={active} filename={'profit_summary'} headers={['Period', 'Sales', 'Expenses', 'Net Profit']} rows={monthEntries.map(([m, d]) => [m, d.sales.toFixed(2), d.expenses.toFixed(2), (d.sales - d.expenses).toFixed(2)])} />
          <DataTable headers={['Period', 'Sales', 'Expenses', 'Net Profit', 'Margin']} alignRight={[1, 2, 3, 4]}
            rows={monthEntries.map(([m, d]) => {
              const net = d.sales - d.expenses;
              const mg = d.sales > 0 ? (net / d.sales) * 100 : 0;
              return [m, `GH₵ ${d.sales.toFixed(2)}`, `GH₵ ${d.expenses.toFixed(2)}`, `GH₵ ${net.toFixed(2)}`, `${mg.toFixed(1)}%`];
            })}
            totalsRow={['TOTALS', `GH₵ ${totalSales.toFixed(2)}`, `GH₵ ${totalExpenses.toFixed(2)}`, `GH₵ ${netProfit.toFixed(2)}`, `${margin.toFixed(1)}%`]}
            emptyText="No data for this period." />
        </div>
      );
    }

    if (active === 'Payment report') {
      const totalReceived = payments.reduce((s, p) => s + Number(p.amount), 0);
      const byType = payments.reduce((acc, p) => {
        const type = (p as any).payment_types?.name || 'Unknown';
        acc[type] = (acc[type] || 0) + Number(p.amount);
        return acc;
      }, {} as Record<string, number>);
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Payments', value: `GH₵ ${totalReceived.toFixed(2)}`, accent: true },
            { label: 'Transactions', value: String(payments.length) },
            ...Object.entries(byType).slice(0, 2).map(([type, amt]) => ({ label: type, value: `GH₵ ${(amt as number).toFixed(2)}` })),
          ]} />
          <ExportButton title={active} filename={'payments'} headers={['Date', 'Document', 'Category', 'Amount', 'Method', 'Reference', 'Paid By']} rows={payments.map(p => [new Date(p.paid_at).toLocaleDateString('en-GB'), (p as any).documents?.doc_number || '—', (p as any).documents?.category || '—', Number(p.amount).toFixed(2), (p as any).payment_types?.name || '—', p.reference || '', p.paid_by || ''])} />
          <DataTable headers={['Date', 'Document', 'Category', 'Customer', 'Amount', 'Method', 'Reference', 'Paid By']} alignRight={[4]}
            rows={payments.map(p => [
              new Date(p.paid_at).toLocaleDateString('en-GB'),
              (p as any).documents?.doc_number || '—',
              (p as any).documents?.category || '—',
              (p as any).documents?.customer_name || '—',
              `GH₵ ${Number(p.amount).toFixed(2)}`,
              (p as any).payment_types?.name || '—',
              p.reference || '—',
              p.paid_by || '—',
            ])}
            totalsRow={['TOTALS', `${payments.length} payments`, '', '', `GH₵ ${totalReceived.toFixed(2)}`, '', '', '']}
            emptyText="No payments for this period." />
        </div>
      );
    }

    if (active === 'Outstanding balances') {
      const unpaid = documents.filter(d => d.balance_due > 0 && d.status !== 'voided');
      const totalOutstanding = unpaid.reduce((s, d) => s + Number(d.balance_due), 0);
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Outstanding Balance', value: `GH₵ ${totalOutstanding.toFixed(2)}`, destructive: true },
            { label: 'Documents', value: String(unpaid.length) },
          ]} />
          <DataTable headers={['Doc #', 'Category', 'Type', 'Customer', 'Total', 'Paid', 'Balance', 'Status', 'Date']} alignRight={[4, 5, 6]}
            rows={unpaid.map(d => [
              d.doc_number || 'Draft', d.category, d.sub_type, d.customer_name || '—',
              `GH₵ ${Number(d.total).toFixed(2)}`, `GH₵ ${Number(d.amount_paid).toFixed(2)}`, `GH₵ ${Number(d.balance_due).toFixed(2)}`,
              d.payment_status, new Date(d.created_at).toLocaleDateString('en-GB'),
            ])}
            totalsRow={(() => { const tt = unpaid.reduce((s, d) => s + Number(d.total), 0); const tp = unpaid.reduce((s, d) => s + Number(d.amount_paid), 0); return ['TOTALS', `${unpaid.length} docs`, '', '', `GH₵ ${tt.toFixed(2)}`, `GH₵ ${tp.toFixed(2)}`, `GH₵ ${totalOutstanding.toFixed(2)}`, '', '']; })()}
            paymentStatusCol={7} emptyText="No outstanding balances." />
        </div>
      );
    }

    // ── STOCK REPORTS ──
    if (active === 'Stock levels') {
      const lowStock = products.filter(p => p.qty > 0 && p.qty <= p.reorder_level);
      const outOfStock = products.filter(p => p.qty <= 0);
      const sorted = [...products].sort((a, b) => a.qty - b.qty);
      const totalValue = products.reduce((s, p) => s + (p.qty * Number(p.cost_price)), 0);
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Products', value: String(products.length) },
            { label: 'Low Stock', value: String(lowStock.length), destructive: lowStock.length > 0 },
            { label: 'Out of Stock', value: String(outOfStock.length), destructive: outOfStock.length > 0 },
            { label: 'Stock Value', value: `GH₵ ${totalValue.toFixed(2)}` },
          ]} />
          <ExportButton title={active} filename={'stock_levels'} headers={['Product', 'Category', 'Qty', 'Reorder', 'Cost Price', 'Sales Price', 'Value']} rows={sorted.map(p => [p.name, p.category, String(p.qty), String(p.reorder_level), Number(p.cost_price).toFixed(2), Number(p.sales_price).toFixed(2), (p.qty * Number(p.cost_price)).toFixed(2)])} />
          <DataTable headers={['Product', 'Category', 'Current Qty', 'Reorder', 'Cost Price', 'Stock Value', 'Status']} alignRight={[2, 3, 4, 5]}
            rows={sorted.map(p => {
              const status = p.qty <= 0 ? 'Out of stock' : p.qty <= p.reorder_level ? 'Low stock' : 'OK';
              return [p.name, p.category, String(p.qty), String(p.reorder_level), `GH₵ ${Number(p.cost_price).toFixed(2)}`, `GH₵ ${(p.qty * Number(p.cost_price)).toFixed(2)}`, status];
            })}
            totalsRow={['TOTALS', `${products.length} items`, String(products.reduce((s, p) => s + p.qty, 0)), '', '', `GH₵ ${totalValue.toFixed(2)}`, '']}
            emptyText="No products." />
        </div>
      );
    }

    if (active === 'Stock movements') {
      const totalIn = stockMovements.filter(m => m.movement_type === 'in').reduce((s, m) => s + m.quantity, 0);
      const totalOut = stockMovements.filter(m => m.movement_type === 'out').reduce((s, m) => s + m.quantity, 0);
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Movements', value: String(stockMovements.length) },
            { label: 'Stock In', value: String(totalIn), accent: true },
            { label: 'Stock Out', value: String(totalOut), destructive: true },
            { label: 'Adjustments', value: String(stockMovements.filter(m => m.movement_type === 'adjustment').length) },
          ]} />
          <ExportButton title={active} filename={'stock_movements'} headers={['Date', 'Product', 'Type', 'Qty', 'Before', 'After', 'Reference', 'Reason']} rows={stockMovements.map(m => [new Date(m.created_at).toLocaleDateString('en-GB'), (m as any).products?.name || '—', m.movement_type, String(m.quantity), String(m.quantity_before), String(m.quantity_after), m.reference || '', m.reason || ''])} />
          <DataTable headers={['Date', 'Product', 'Type', 'Qty', 'Before', 'After', 'Reference', 'Reason']} alignRight={[3, 4, 5]}
            rows={stockMovements.map(m => [
              new Date(m.created_at).toLocaleDateString('en-GB'),
              (m as any).products?.name || '—',
              m.movement_type,
              String(m.quantity),
              String(m.quantity_before),
              String(m.quantity_after),
              m.reference || '—',
              m.reason || '—',
            ])}
            totalsRow={['TOTALS', `${stockMovements.length} movements`, `+${totalIn} / -${totalOut}`, String(totalIn + totalOut), '', '', '', '']}
            emptyText="No stock movements for this period." />
        </div>
      );
    }

    if (active === 'Goods received') {
      const purchases = documents.filter(d => d.category === 'Purchases' && d.status !== 'voided');
      const sorted = [...purchases].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const totalValue = purchases.reduce((s, d) => s + Number(d.total), 0);
      const totalPaid = purchases.reduce((s, d) => s + Number(d.amount_paid), 0);
      const totalBalance = purchases.reduce((s, d) => s + Number(d.balance_due), 0);
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Purchases', value: `GH₵ ${totalValue.toFixed(2)}`, accent: true },
            { label: 'Documents', value: String(purchases.length) },
            { label: 'Paid', value: `GH₵ ${totalPaid.toFixed(2)}` },
            { label: 'Outstanding', value: `GH₵ ${totalBalance.toFixed(2)}`, destructive: totalBalance > 0 },
          ]} />
          <ExportButton title={active} filename={'goods_received'}
            headers={['Date', 'Doc #', 'Type', 'Supplier', 'Total', 'Paid', 'Balance', 'Payment', 'Status']}
            rows={sorted.map(d => [
              new Date(d.created_at).toLocaleDateString('en-GB'),
              d.doc_number || 'Draft', d.sub_type || '—', d.customer_name || '—',
              Number(d.total).toFixed(2), Number(d.amount_paid).toFixed(2), Number(d.balance_due).toFixed(2),
              d.payment_status, d.status,
            ])} />
          <DataTable headers={['Date', 'Doc #', 'Type', 'Supplier', 'Total', 'Paid', 'Balance', 'Payment', 'Status']}
            alignRight={[4, 5, 6]}
            rows={sorted.map(d => [
              new Date(d.created_at).toLocaleDateString('en-GB'),
              d.doc_number || 'Draft',
              d.sub_type || '—',
              d.customer_name || '—',
              `GH₵ ${Number(d.total).toFixed(2)}`,
              `GH₵ ${Number(d.amount_paid).toFixed(2)}`,
              `GH₵ ${Number(d.balance_due).toFixed(2)}`,
              d.payment_status,
              d.status,
            ])}
            totalsRow={['TOTALS', `${purchases.length} docs`, '', '',
              `GH₵ ${totalValue.toFixed(2)}`, `GH₵ ${totalPaid.toFixed(2)}`, `GH₵ ${totalBalance.toFixed(2)}`, '', '']}
            statusCol={8} paymentStatusCol={7}
            emptyText="No goods received for this period." />
        </div>
      );
    }

    if (active === 'Expiry tracking') {
      const today = new Date();
      const in30 = new Date(); in30.setDate(in30.getDate() + 30);
      const in90 = new Date(); in90.setDate(in90.getDate() + 90);
      const withExpiry = products.filter(p => p.expiry_date);
      const expired = withExpiry.filter(p => new Date(p.expiry_date!) <= today);
      const expiring30 = withExpiry.filter(p => { const d = new Date(p.expiry_date!); return d > today && d <= in30; });
      const expiring90 = withExpiry.filter(p => { const d = new Date(p.expiry_date!); return d > in30 && d <= in90; });
      const sorted = [...withExpiry].sort((a, b) => new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime());
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Expired', value: String(expired.length), destructive: expired.length > 0 },
            { label: 'Expiring in 30 days', value: String(expiring30.length), destructive: expiring30.length > 0 },
            { label: 'Expiring in 90 days', value: String(expiring90.length) },
          ]} />
          <DataTable headers={['Product', 'Batch', 'Qty', 'Expiry Date', 'Status']} alignRight={[2]}
            rows={sorted.map(p => {
              const exp = new Date(p.expiry_date!);
              const status = exp <= today ? 'Expired' : exp <= in30 ? 'Expiring soon' : 'OK';
              return [p.name, p.batch_number || '—', String(p.qty), exp.toLocaleDateString('en-GB'), status];
            })}
            emptyText="No products with expiry dates." />
        </div>
      );
    }

    // ── ACTIVITY REPORTS ──
    if (active === 'Activity log') {
      const byUser = activityLogs.reduce((acc, l) => {
        const name = (l as any).user_name || 'Unknown';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Actions', value: String(activityLogs.length) },
            { label: 'Active Users', value: String(Object.keys(byUser).length) },
          ]} />
          <ExportButton title={active} filename={'activity_log'} headers={['Date', 'Time', 'User', 'Action', 'Module', 'Reference']} rows={activityLogs.map(l => {
              const dt = new Date(l.created_at);
              return [dt.toLocaleDateString('en-GB'), dt.toLocaleTimeString('en-GB'), (l as any).user_name || '—', l.action, l.module, l.document_ref || ''];
            })} />
          <DataTable headers={['Date', 'Time', 'User', 'Action', 'Module', 'Reference']}
            rows={activityLogs.map(l => {
              const dt = new Date(l.created_at);
              return [dt.toLocaleDateString('en-GB'), dt.toLocaleTimeString('en-GB'), (l as any).user_name || '—', l.action, l.module, l.document_ref || '—'];
            })}
            emptyText="No activity for this period." />
        </div>
      );
    }

    if (active === 'Document audit') {
      // Group documents by category/type
      const byCategory = documents.reduce((acc, d) => {
        const cat = d.category;
        if (!acc[cat]) acc[cat] = { count: 0, total: 0, draft: 0, posted: 0, voided: 0 };
        acc[cat].count += 1;
        acc[cat].total += Number(d.total);
        if (d.status === 'draft') acc[cat].draft += 1;
        else if (d.status === 'posted') acc[cat].posted += 1;
        else if (d.status === 'voided') acc[cat].voided += 1;
        return acc;
      }, {} as Record<string, { count: number; total: number; draft: number; posted: number; voided: number }>);
      const sorted = Object.entries(byCategory).sort((a, b) => (b[1] as any).total - (a[1] as any).total);
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Documents', value: String(documents.length) },
            { label: 'Total Value', value: `GH₵ ${documents.reduce((s, d) => s + Number(d.total), 0).toFixed(2)}` },
            { label: 'Drafts', value: String(documents.filter(d => d.status === 'draft').length) },
            { label: 'Posted', value: String(documents.filter(d => d.status === 'posted').length) },
          ]} />
          <DataTable headers={['Category', 'Documents', 'Draft', 'Posted', 'Voided', 'Total Value']} alignRight={[1, 2, 3, 4, 5]}
            rows={sorted.map(([cat, rawD]) => { const d = rawD as { count: number; total: number; draft: number; posted: number; voided: number }; return [cat, String(d.count), String(d.draft), String(d.posted), String(d.voided), `GH₵ ${d.total.toFixed(2)}`]; })}
            totalsRow={(() => { const tot = sorted.reduce((s, [, r]) => { const d = r as any; return { count: s.count + d.count, draft: s.draft + d.draft, posted: s.posted + d.posted, voided: s.voided + d.voided, total: s.total + d.total }; }, { count: 0, draft: 0, posted: 0, voided: 0, total: 0 }); return ['TOTALS', String(tot.count), String(tot.draft), String(tot.posted), String(tot.voided), `GH₵ ${tot.total.toFixed(2)}`]; })()}
            emptyText="No documents for this period." />
        </div>
      );
    }

    // ── STAFF REPORTS ──
    if (active === 'Expenses by user') {
      const staffExpenses: Record<string, { total: number; paid: number; count: number; types: Set<string> }> = {};
      expenseDocs.forEach(d => {
        const uid = d.user_id;
        if (!staffExpenses[uid]) staffExpenses[uid] = { total: 0, paid: 0, count: 0, types: new Set() };
        staffExpenses[uid].total += Number(d.total);
        staffExpenses[uid].paid += Number(d.amount_paid);
        staffExpenses[uid].count += 1;
        staffExpenses[uid].types.add(d.sub_type);
      });
      const sorted = Object.entries(staffExpenses).sort((a, b) => b[1].total - a[1].total);
      const grandTotal = sorted.reduce((s, [, d]) => s + d.total, 0);
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Expenses', value: `GH₵ ${grandTotal.toFixed(2)}`, destructive: true },
            { label: 'Total Documents', value: String(expenseDocs.length) },
            { label: 'Staff Involved', value: String(sorted.length) },
            { label: 'Avg per Staff', value: `GH₵ ${sorted.length > 0 ? (grandTotal / sorted.length).toFixed(2) : '0.00'}` },
          ]} />
          <ExportButton title={active} filename={'expenses_by_user'} headers={['#', 'Staff', 'Documents', 'Expense Types', 'Total', 'Paid', 'Unpaid', '% Share']} rows={sorted.map(([uid, d], i) => [String(i + 1), getStaffName(uid), String(d.count), String(d.types.size), d.total.toFixed(2), d.paid.toFixed(2), (d.total - d.paid).toFixed(2), grandTotal > 0 ? ((d.total / grandTotal) * 100).toFixed(1) + '%' : '0%'])} />
          <DataTable headers={['#', 'Staff', 'Documents', 'Types', 'Total Expenses', 'Paid', 'Unpaid', '% Share']} alignRight={[2, 3, 4, 5, 6, 7]}
            rows={sorted.map(([uid, d], i) => [
              String(i + 1), getStaffName(uid), String(d.count), String(d.types.size),
              `GH₵ ${d.total.toFixed(2)}`, `GH₵ ${d.paid.toFixed(2)}`,
              `GH₵ ${(d.total - d.paid).toFixed(2)}`,
              `${grandTotal > 0 ? ((d.total / grandTotal) * 100).toFixed(1) : 0}%`,
            ])}
            totalsRow={(() => { const tCnt = sorted.reduce((s, [, d]) => s + d.count, 0); const tPaid = sorted.reduce((s, [, d]) => s + d.paid, 0); return ['', 'TOTALS', String(tCnt), '', `GH₵ ${grandTotal.toFixed(2)}`, `GH₵ ${tPaid.toFixed(2)}`, `GH₵ ${(grandTotal - tPaid).toFixed(2)}`, '100%']; })()}
            emptyText="No expense data for this period." />
        </div>
      );
    }

    if (active === 'Collections by user') {
      const staffCollections: Record<string, { total: number; count: number; methods: Record<string, number> }> = {};
      payments.forEach(p => {
        const uid = p.received_by || 'unknown';
        if (!staffCollections[uid]) staffCollections[uid] = { total: 0, count: 0, methods: {} };
        staffCollections[uid].total += Number(p.amount);
        staffCollections[uid].count += 1;
        const method = (p as any).payment_types?.name || 'Unknown';
        staffCollections[uid].methods[method] = (staffCollections[uid].methods[method] || 0) + Number(p.amount);
      });
      const sorted = Object.entries(staffCollections).sort((a, b) => b[1].total - a[1].total);
      const grandTotal = sorted.reduce((s, [, d]) => s + d.total, 0);
      return (
        <div className="space-y-3">
          <SummaryCards items={[
            { label: 'Total Collected', value: `GH₵ ${grandTotal.toFixed(2)}`, accent: true },
            { label: 'Total Receipts', value: String(payments.length) },
            { label: 'Staff Involved', value: String(sorted.length) },
            { label: 'Avg Collection', value: `GH₵ ${payments.length > 0 ? (grandTotal / payments.length).toFixed(2) : '0.00'}` },
          ]} />
          <ExportButton title={active} filename={'collections_by_user'} headers={['#', 'Staff', 'Receipts', 'Total Collected', '% Share', 'Top Method']} rows={sorted.map(([uid, d], i) => {
              const topMethod = Object.entries(d.methods).sort((a, b) => b[1] - a[1])[0];
              return [String(i + 1), getStaffName(uid), String(d.count), d.total.toFixed(2), grandTotal > 0 ? ((d.total / grandTotal) * 100).toFixed(1) + '%' : '0%', topMethod ? `${topMethod[0]} (GH₵ ${topMethod[1].toFixed(2)})` : '—'];
            })} />
          <DataTable headers={['#', 'Staff', 'Receipts', 'Total Collected', '% Share', 'Top Payment Method']} alignRight={[2, 3, 4]}
            rows={sorted.map(([uid, d], i) => {
              const topMethod = Object.entries(d.methods).sort((a, b) => b[1] - a[1])[0];
              return [
                String(i + 1), getStaffName(uid), String(d.count),
                `GH₵ ${d.total.toFixed(2)}`,
                `${grandTotal > 0 ? ((d.total / grandTotal) * 100).toFixed(1) : 0}%`,
                topMethod ? `${topMethod[0]} (GH₵ ${topMethod[1].toFixed(2)})` : '—',
              ];
            })}
            totalsRow={['', 'TOTALS', String(payments.length), `GH₵ ${grandTotal.toFixed(2)}`, '100%', '']}
            emptyText="No collection data for this period." />
        </div>
      );
    }

    // ── INSIGHT REPORTS ──
    if (active === 'Product insights') return <ProductInsights saleItems={saleItems} />;
    if (active === 'Expense insights') return <ExpenseInsights expenses={expenseDocs} />;
    if (active === 'Profit insights') return <ProfitInsights salesData={salesData} expenses={expenseDocs} />;
    
    if (active === 'Payment insights') return <PaymentInsights payments={payments} />;
    if (active === 'Stock insights') return <StockInsights products={products} stockMovements={stockMovements} />;
    

    return null;
  };

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-0px)]">
      {/* Sidebar (desktop) */}
      <div className="hidden lg:block w-56 border-r bg-card p-3 space-y-4 overflow-y-auto shrink-0">
        {REPORT_GROUPS.map(group => (
          <div key={group.label}>
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <group.icon className="w-3.5 h-3.5" />
              {group.label}
            </div>
            <div className="space-y-0.5 mt-1">
              {group.items.map(r => (
                <button key={r} onClick={() => handleActiveChange(r)}
                  className={cn('w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
                    active === r ? 'bg-primary text-primary-foreground font-medium' : 'text-foreground hover:bg-secondary')}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Report picker (phones and tablets) */}
      <div className="lg:hidden border-b bg-card p-3">
        <Select value={active} onValueChange={handleActiveChange}>
          <SelectTrigger className="h-10 w-full">
            <span className="truncate">{active}</span>
          </SelectTrigger>
          <SelectContent>
            {REPORT_GROUPS.map(group => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.items.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Main content */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto min-w-0">
        <div className="flex items-center justify-between mb-4 md:mb-6 flex-wrap gap-3">
          <h1 className="text-xl md:text-2xl font-semibold">{active}</h1>
          <div className="flex gap-2 items-center flex-wrap">
            {(['today', 'week', 'month', 'quarter', 'year'] as DateRange[]).map(r => (
              <Button key={r} variant={range === r ? 'default' : 'outline'} size="sm" onClick={() => handleRangeChange(r)}>
                {r === 'today' ? 'Today' : r === 'week' ? 'Week' : r === 'month' ? 'Month' : r === 'quarter' ? 'Quarter' : 'Year'}
              </Button>
            ))}
            <Button variant={range === 'custom' ? 'default' : 'outline'} size="sm" onClick={() => handleRangeChange('custom')}>Custom</Button>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-full sm:w-[180px] h-9">
                <span className="truncate">{branchId === 'all' ? 'All branches' : (outlets.find(o => o.id === branchId)?.name || 'Branch')}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleGenerate}>Generate</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrintReport}>
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
          </div>
        </div>

        {range === 'custom' && (
          <div className="mb-4">
            <DateRangePicker
              from={customFrom}
              to={customTo}
              onFromChange={setCustomFrom}
              onToChange={setCustomTo}
              size="sm"
              className="w-72"
            />
          </div>
        )}

        <div ref={reportRef}>{renderReport()}</div>
      </div>
    </div>
  );
}

// ── Reusable Sub-Components ──

function SummaryCards({ items }: { items: { label: string; value: string; sub?: string; accent?: boolean; destructive?: boolean }[] }) {
  return (
    <div className={cn('summary-cards grid gap-4', items.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4')}>
      {items.map(item => (
        <Card key={item.label}>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={cn('text-xl font-bold', item.accent && 'text-accent', item.destructive && 'text-destructive')}>{item.value}</p>
            {item.sub && <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ExportButton({ title, filename, headers, rows, alignRight, totalsRow }: {
  title: string;
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  alignRight?: number[];
  totalsRow?: (string | number)[];
}) {
  return (
    <div className="flex justify-end no-print">
      <RecordsToolbar
        disabled={rows.length === 0}
        getData={() => ({ title, subtitle: `${rows.length} record(s)`, filename, headers, rows, alignRight, totalsRow })}
      />
    </div>
  );
}

function DataTable({ headers, rows, alignRight = [], emptyText, statusCol, paymentStatusCol, totalsRow }: {
  headers: string[];
  rows: string[][];
  alignRight?: number[];
  emptyText: string;
  statusCol?: number;
  paymentStatusCol?: number;
  totalsRow?: string[];
}) {
  return (
    <div className="border rounded-lg overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h, i) => (
              <TableHead key={i} className={cn(alignRight.includes(i) && 'text-right')}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, ri) => (
            <TableRow key={ri}>
              {row.map((cell, ci) => {
                let cls = '';
                if (alignRight.includes(ci)) cls += ' text-right';
                if (ci === 1 && !alignRight.includes(ci)) cls += ' font-medium';

                // Status coloring
                if (ci === statusCol) {
                  const statusCls = cell === 'posted' || cell === 'paid' ? 'bg-accent/10 text-accent' : cell === 'voided' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground';
                  return <TableCell key={ci}><span className={cn('px-2 py-0.5 rounded text-xs', statusCls)}>{cell}</span></TableCell>;
                }
                if (ci === paymentStatusCol) {
                  const pCls = cell === 'paid' ? 'bg-accent/10 text-accent' : cell === 'partial' ? 'bg-amber-500/10 text-amber-600' : 'bg-secondary text-muted-foreground';
                  return <TableCell key={ci}><span className={cn('px-2 py-0.5 rounded text-xs', pCls)}>{cell}</span></TableCell>;
                }

                return <TableCell key={ci} className={cls}>{cell}</TableCell>;
              })}
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={headers.length} className="text-center text-muted-foreground py-8">{emptyText}</TableCell></TableRow>
          )}
        </TableBody>
        {totalsRow && rows.length > 0 && (
          <TableFooter>
            <TableRow className="bg-muted/50 font-bold">
              {totalsRow.map((cell, ci) => (
                <TableCell key={ci} className={cn('font-bold', alignRight.includes(ci) && 'text-right')}>{cell}</TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

