import { useEffect, useMemo, useRef } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useProductsRealtime } from '@/hooks/useProducts';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  useProductsRealtime();
  const hasTriedFullscreen = useRef(false);

  // Auto-enter fullscreen on first dashboard load (after login)
  useEffect(() => {
    if (hasTriedFullscreen.current) return;
    hasTriedFullscreen.current = true;
    const tryFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    // Small delay to ensure DOM is ready
    setTimeout(tryFullscreen, 300);
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const monthStart = (() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; })();

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').limit(10000);
      return data || [];
    },
  });

  const { data: todaySales = 0 } = useQuery({
    queryKey: ['dashboard-today-sales'],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('total').gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59');
      return (data || []).reduce((sum, s) => sum + Number(s.total), 0);
    },
    refetchInterval: 30000,
  });

  const { data: monthSales = 0 } = useQuery({
    queryKey: ['dashboard-month-sales'],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('total').gte('created_at', monthStart + 'T00:00:00');
      return (data || []).reduce((sum, s) => sum + Number(s.total), 0);
    },
    refetchInterval: 30000,
  });

  const { data: monthExpenses = 0 } = useQuery({
    queryKey: ['dashboard-month-expenses'],
    queryFn: async () => {
      const { data } = await supabase.from('documents').select('total').eq('category', 'Expenses').neq('status', 'voided').gte('created_at', monthStart + 'T00:00:00');
      return (data || []).reduce((sum, d) => sum + Number(d.total), 0);
    },
    refetchInterval: 30000,
  });

  const { data: pendingPayments = 0 } = useQuery({
    queryKey: ['dashboard-pending-payments'],
    queryFn: async () => {
      const { data } = await supabase.from('documents').select('balance_due').in('payment_status', ['unpaid', 'partial']).neq('status', 'voided');
      return (data || []).reduce((sum, d) => sum + Number(d.balance_due), 0);
    },
  });


  const { data: recentSales = [] } = useQuery({
    queryKey: ['dashboard-recent-sales'],
    queryFn: async () => {
      const { data: sales } = await supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(8);
      if (!sales || sales.length === 0) return [];
      const saleIds = sales.map(s => s.id);
      const cashierIds = [...new Set(sales.map(s => s.cashier_id).filter(Boolean))];
      const [{ data: items }, { data: profs }] = await Promise.all([
        supabase.from('sale_items').select('sale_id, quantity, products(name)').in('sale_id', saleIds),
        supabase.from('profiles').select('user_id, full_name').in('user_id', cashierIds),
      ]);
      const profMap: Record<string, string> = {};
      (profs || []).forEach((p: any) => { profMap[p.user_id] = p.full_name; });
      const itemMap: Record<string, { names: string[]; qty: number }> = {};
      (items || []).forEach((i: any) => {
        if (!itemMap[i.sale_id]) itemMap[i.sale_id] = { names: [], qty: 0 };
        itemMap[i.sale_id].names.push(i.products?.name || 'Unknown');
        itemMap[i.sale_id].qty += i.quantity;
      });
      return sales.map(s => ({
        ...s,
        product_summary: itemMap[s.id]?.names.join(', ') || '—',
        total_qty: itemMap[s.id]?.qty || 0,
        cashier_name: profMap[s.cashier_id] || '—',
      }));
    },
  });

  const { data: recentDocs = [] } = useQuery({
    queryKey: ['dashboard-recent-docs'],
    queryFn: async () => {
      const { data } = await supabase.from('documents').select('id, doc_number, category, sub_type, total, status, payment_status, created_at').order('created_at', { ascending: false }).limit(8);
      return data || [];
    },
  });

  // Best selling product (this month)
  const { data: bestSeller } = useQuery({
    queryKey: ['dashboard-best-seller', monthStart],
    queryFn: async () => {
      const { data: sales } = await supabase.from('sales').select('id').gte('created_at', monthStart + 'T00:00:00');
      if (!sales || sales.length === 0) return null;
      const { data: items } = await supabase.from('sale_items').select('product_id, quantity, products(name)').in('sale_id', sales.map(s => s.id));
      if (!items || items.length === 0) return null;
      const map: Record<string, { name: string; qty: number }> = {};
      items.forEach((i: any) => {
        const name = i.products?.name || 'Unknown';
        if (!map[name]) map[name] = { name, qty: 0 };
        map[name].qty += i.quantity;
      });
      return Object.values(map).sort((a, b) => b.qty - a.qty)[0] || null;
    },
    refetchInterval: 60000,
  });

  // Top customer (this month)
  const { data: topCustomer } = useQuery({
    queryKey: ['dashboard-top-customer', monthStart],
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('customer_name, total').gte('created_at', monthStart + 'T00:00:00');
      if (!data || data.length === 0) return null;
      const map: Record<string, number> = {};
      data.forEach(s => {
        const name = s.customer_name || 'Walk-in';
        map[name] = (map[name] || 0) + Number(s.total);
      });
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
      return sorted[0] ? { name: sorted[0][0], total: sorted[0][1] } : null;
    },
    refetchInterval: 60000,
  });

  // Highest expense category (this month)
  const { data: topExpense } = useQuery({
    queryKey: ['dashboard-top-expense', monthStart],
    queryFn: async () => {
      const { data } = await supabase.from('documents').select('sub_type, total').eq('category', 'Expenses').neq('status', 'voided').gte('created_at', monthStart + 'T00:00:00');
      if (!data || data.length === 0) return null;
      const map: Record<string, number> = {};
      data.forEach(d => { map[d.sub_type] = (map[d.sub_type] || 0) + Number(d.total); });
      const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
      return sorted[0] ? { name: sorted[0][0], total: sorted[0][1] } : null;
    },
    refetchInterval: 60000,
  });

  // Sales vs Expenses trend (last 7 days)
  const { data: weeklyTrend = [], isLoading: trendLoading } = useQuery({
    queryKey: ['dashboard-weekly-trend'],
    queryFn: async () => {
      const days: { date: string; sales: number; expenses: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const { data: salesDay } = await supabase.from('sales').select('total').gte('created_at', dateStr + 'T00:00:00').lte('created_at', dateStr + 'T23:59:59');
        const { data: expDay } = await supabase.from('documents').select('total').eq('category', 'Expenses').neq('status', 'voided').gte('created_at', dateStr + 'T00:00:00').lte('created_at', dateStr + 'T23:59:59');
        days.push({
          date: label,
          sales: (salesDay || []).reduce((s, r) => s + Number(r.total), 0),
          expenses: (expDay || []).reduce((s, r) => s + Number(r.total), 0),
        });
      }
      return days;
    },
    refetchInterval: 60000,
  });

  const lowStock = products.filter(p => p.qty > 0 && p.qty <= p.reorder_level);
  const outOfStock = products.filter(p => p.qty <= 0);
  const netProfit = monthSales - monthExpenses;

  const expiringSoon = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 30);
    return products.filter(p => p.expiry_date && new Date(p.expiry_date) <= cutoff);
  }, [products]);

  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase.channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        qc.invalidateQueries({ queryKey: ['dashboard-today-sales'] });
        qc.invalidateQueries({ queryKey: ['dashboard-month-sales'] });
        qc.invalidateQueries({ queryKey: ['dashboard-recent-sales'] });
        qc.invalidateQueries({ queryKey: ['dashboard-best-seller'] });
        qc.invalidateQueries({ queryKey: ['dashboard-top-customer'] });
        qc.invalidateQueries({ queryKey: ['dashboard-weekly-trend'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        qc.invalidateQueries({ queryKey: ['products'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        qc.invalidateQueries({ queryKey: ['dashboard-month-expenses'] });
        qc.invalidateQueries({ queryKey: ['dashboard-pending-payments'] });
        qc.invalidateQueries({ queryKey: ['dashboard-recent-docs'] });
        qc.invalidateQueries({ queryKey: ['dashboard-top-expense'] });
        qc.invalidateQueries({ queryKey: ['dashboard-weekly-trend'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const summary = [
    { label: "Today's Sales", value: `GH₵ ${todaySales.toFixed(2)}` },
    { label: 'Month Sales', value: `GH₵ ${monthSales.toFixed(2)}` },
    { label: 'Month Expenses', value: `GH₵ ${monthExpenses.toFixed(2)}` },
    { label: 'Net Profit', value: `GH₵ ${netProfit.toFixed(2)}` },
    { label: 'Pending Payments', value: `GH₵ ${pendingPayments.toFixed(2)}` },
    { label: 'Low Stock', value: String(lowStock.length) },
    { label: 'Out of Stock', value: String(outOfStock.length) },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {summary.map(s => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4 px-5">
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Insight Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground mb-2">Best Selling Product</p>
            <p className="text-lg font-bold text-foreground">{bestSeller?.name || '—'}</p>
            {bestSeller && <p className="text-xs text-muted-foreground">{bestSeller.qty} units this month</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground mb-2">Top Customer</p>
            <p className="text-lg font-bold text-foreground">{topCustomer?.name || '—'}</p>
            {topCustomer && <p className="text-xs text-muted-foreground">GH₵ {topCustomer.total.toFixed(2)} this month</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground mb-2">Highest Expense</p>
            <p className="text-lg font-bold text-foreground">{topExpense?.name || '—'}</p>
            {topExpense && <p className="text-xs text-muted-foreground">GH₵ {topExpense.total.toFixed(2)} this month</p>}
          </CardContent>
        </Card>
      </div>

      {/* Sales vs Expenses Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Sales vs Expenses (Last 7 Days)</CardTitle></CardHeader>
        <CardContent>
          {trendLoading ? (
            <Skeleton className="h-[250px] w-full" aria-label="Loading sales trend" role="status" />
          ) : weeklyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                <YAxis tickFormatter={v => `₵${v}`} className="text-xs fill-muted-foreground" />
                <Tooltip formatter={(v: number) => `GH₵ ${v.toFixed(2)}`} />
                <Legend />
                <Line type="monotone" dataKey="sales" stroke="hsl(var(--accent))" strokeWidth={2} name="Sales" />
                <Line type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" strokeWidth={2} name="Expenses" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No trend data available.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Sales</CardTitle></CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No sales recorded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Sales Rep</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSales.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-sm">{s.invoice_number}</TableCell>
                      <TableCell className="text-sm">{s.customer_name || 'Walk-in'}</TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate" title={s.product_summary}>{s.product_summary}</TableCell>
                      <TableCell className="text-right text-sm">{s.total_qty}</TableCell>
                      <TableCell className="text-sm">{s.cashier_name}</TableCell>
                      <TableCell className="text-right text-sm">GH₵ {Number(s.total).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString('en-GB')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent Documents</CardTitle></CardHeader>
          <CardContent>
            {recentDocs.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No documents yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doc #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDocs.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium text-sm">{d.doc_number || 'Draft'}</TableCell>
                      <TableCell className="text-sm">{d.sub_type}</TableCell>
                      <TableCell className="text-right text-sm">GH₵ {Number(d.total).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === 'posted' ? 'default' : d.status === 'voided' ? 'destructive' : 'secondary'} className="text-[10px]">{d.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Low Stock Alerts</CardTitle></CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No low stock items</div>
            ) : (
              <div className="space-y-2">
                {lowStock.slice(0, 8).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.name}</span>
                    <Badge variant="destructive" className="text-[10px]">Qty: {p.qty} / {p.reorder_level}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Expiry Alerts (30 days)</CardTitle></CardHeader>
          <CardContent>
            {expiringSoon.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No items expiring soon</div>
            ) : (
              <div className="space-y-2">
                {expiringSoon.slice(0, 8).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.name}</span>
                    <Badge className="bg-warning text-warning-foreground text-[10px]">{p.expiry_date}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
