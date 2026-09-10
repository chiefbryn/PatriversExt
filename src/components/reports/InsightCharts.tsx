import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const CHART_COLORS = [
  'hsl(var(--accent))',
  'hsl(var(--destructive))',
  'hsl(var(--primary))',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#10b981',
];

// ── Product Insights ──
export function ProductInsights({ saleItems }: { saleItems: any[] }) {
  const { bestSelling, topRevenue, leastSelling, fastMoving } = useMemo(() => {
    const productMap: Record<string, { name: string; qty: number; revenue: number; txCount: number }> = {};
    const saleMap: Record<string, Set<string>> = {};

    saleItems.forEach(si => {
      const name = si.products?.name || 'Unknown';
      if (!productMap[name]) productMap[name] = { name, qty: 0, revenue: 0, txCount: 0 };
      productMap[name].qty += si.quantity;
      productMap[name].revenue += Number(si.line_total);
      if (!saleMap[name]) saleMap[name] = new Set();
      saleMap[name].add(si.sale_id);
    });

    Object.keys(saleMap).forEach(name => {
      if (productMap[name]) productMap[name].txCount = saleMap[name].size;
    });

    const all = Object.values(productMap);
    const bestSelling = [...all].sort((a, b) => b.qty - a.qty).slice(0, 10);
    const topRevenue = [...all].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const leastSelling = [...all].sort((a, b) => a.qty - b.qty).slice(0, 10);
    const fastMoving = [...all].sort((a, b) => b.txCount - a.txCount).slice(0, 10);

    return { bestSelling, topRevenue, leastSelling, fastMoving };
  }, [saleItems]);

  return (
    <div className="space-y-6">
      {/* Top Products Bar Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Top 10 Products by Revenue</CardTitle></CardHeader>
        <CardContent>
          {topRevenue.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topRevenue} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tickFormatter={v => `₵${v}`} className="text-xs fill-muted-foreground" />
                <YAxis type="category" dataKey="name" width={95} className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`GH₵ ${v.toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <RankedList title="Best Selling (by Qty)" items={bestSelling} valueKey="qty" format={v => `${v} units`} />
        <RankedList title="Fast Moving (by Frequency)" items={fastMoving} valueKey="txCount" format={v => `${v} transactions`} />
      </div>
      <RankedList title="Least Selling Products" items={leastSelling} valueKey="qty" format={v => `${v} units`} />
    </div>
  );
}

// ── Expense Insights ──
export function ExpenseInsights({ expenses }: { expenses: any[] }) {
  const { byType, trend, mostFrequent } = useMemo(() => {
    const typeMap: Record<string, { total: number; count: number }> = {};
    const dailyMap: Record<string, number> = {};

    expenses.filter(d => d.status !== 'voided').forEach(d => {
      const type = d.sub_type;
      if (!typeMap[type]) typeMap[type] = { total: 0, count: 0 };
      typeMap[type].total += Number(d.total);
      typeMap[type].count += 1;

      const day = new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      dailyMap[day] = (dailyMap[day] || 0) + Number(d.total);
    });

    const byType = Object.entries(typeMap).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total);
    const trend = Object.entries(dailyMap).map(([date, total]) => ({ date, total }));
    const mostFrequent = [...byType].sort((a, b) => b.count - a.count);

    return { byType, trend, mostFrequent };
  }, [expenses]);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Pie Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">Expense Breakdown</CardTitle></CardHeader>
          <CardContent>
            {byType.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={byType} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {byType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `GH₵ ${v.toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Highest + Most Frequent */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Highest Expense Category</p>
              <p className="text-lg font-bold text-destructive">{byType[0]?.name || '—'}</p>
              <p className="text-sm text-muted-foreground">GH₵ {(byType[0]?.total || 0).toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Most Frequent Expense</p>
              <p className="text-lg font-bold">{mostFrequent[0]?.name || '—'}</p>
              <p className="text-sm text-muted-foreground">{mostFrequent[0]?.count || 0} transactions</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Expense Trend Line */}
      <Card>
        <CardHeader><CardTitle className="text-base">Expense Trend</CardTitle></CardHeader>
        <CardContent>
          {trend.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                <YAxis tickFormatter={v => `₵${v}`} className="text-xs fill-muted-foreground" />
                <Tooltip formatter={(v: number) => [`GH₵ ${v.toFixed(2)}`, 'Expenses']} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Profit Insights ──
export function ProfitInsights({ salesData, expenses }: { salesData: any[]; expenses: any[] }) {
  const { trend, lossPeriods, totalSales, totalExp, netProfit } = useMemo(() => {
    const monthMap: Record<string, { sales: number; expenses: number }> = {};

    salesData.forEach(s => {
      const m = new Date(s.created_at).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      if (!monthMap[m]) monthMap[m] = { sales: 0, expenses: 0 };
      monthMap[m].sales += Number(s.total);
    });

    expenses.filter(d => d.status !== 'voided').forEach(d => {
      const m = new Date(d.created_at).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      if (!monthMap[m]) monthMap[m] = { sales: 0, expenses: 0 };
      monthMap[m].expenses += Number(d.total);
    });

    const trend = Object.entries(monthMap).map(([period, d]) => ({
      period,
      sales: d.sales,
      expenses: d.expenses,
      profit: d.sales - d.expenses,
    }));

    const lossPeriods = trend.filter(t => t.profit < 0);
    const totalSales = salesData.reduce((s, r) => s + Number(r.total), 0);
    const totalExp = expenses.filter(d => d.status !== 'voided').reduce((s, d) => s + Number(d.total), 0);

    return { trend, lossPeriods, totalSales, totalExp, netProfit: totalSales - totalExp };
  }, [salesData, expenses]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Total Sales</p>
          <p className="text-xl font-bold text-accent">GH₵ {totalSales.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Total Expenses</p>
          <p className="text-xl font-bold text-destructive">GH₵ {totalExp.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Net Profit</p>
          <p className={cn('text-xl font-bold', netProfit >= 0 ? 'text-accent' : 'text-destructive')}>GH₵ {netProfit.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0}% margin</p>
        </CardContent></Card>
      </div>

      {/* Sales vs Expenses Line Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Sales vs Expenses</CardTitle></CardHeader>
        <CardContent>
          {trend.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="period" className="text-xs fill-muted-foreground" />
                <YAxis tickFormatter={v => `₵${v}`} className="text-xs fill-muted-foreground" />
                <Tooltip formatter={(v: number) => `GH₵ ${v.toFixed(2)}`} />
                <Legend />
                <Line type="monotone" dataKey="sales" stroke="hsl(var(--accent))" strokeWidth={2} name="Sales" />
                <Line type="monotone" dataKey="expenses" stroke="hsl(var(--destructive))" strokeWidth={2} name="Expenses" />
                <Line type="monotone" dataKey="profit" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="5 5" name="Net Profit" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {lossPeriods.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="text-base text-destructive">Loss Periods Detected</CardTitle></CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Period</TableHead><TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Expenses</TableHead><TableHead className="text-right">Net Loss</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {lossPeriods.map(lp => (
                    <TableRow key={lp.period}>
                      <TableCell className="font-medium">{lp.period}</TableCell>
                      <TableCell className="text-right">GH₵ {lp.sales.toFixed(2)}</TableCell>
                      <TableCell className="text-right">GH₵ {lp.expenses.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-destructive font-medium">GH₵ {lp.profit.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Payment Insights ──
export function PaymentInsights({ payments }: { payments: any[] }) {
  const { byMethod, trend, outstanding } = useMemo(() => {
    const methodMap: Record<string, number> = {};
    const dailyMap: Record<string, number> = {};

    payments.forEach(p => {
      const method = p.payment_types?.name || 'Unknown';
      methodMap[method] = (methodMap[method] || 0) + Number(p.amount);
      const day = new Date(p.paid_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      dailyMap[day] = (dailyMap[day] || 0) + Number(p.amount);
    });

    const byMethod = Object.entries(methodMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const trend = Object.entries(dailyMap).map(([date, total]) => ({ date, total }));
    const total = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);

    return { byMethod, trend, outstanding: total };
  }, [payments]);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Payment Methods</CardTitle></CardHeader>
          <CardContent>
            {byMethod.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={byMethod} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {byMethod.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `GH₵ ${v.toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Most Used Payment Method</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-3xl font-bold text-primary">{byMethod[0]?.name || '—'}</p>
            <p className="text-lg text-muted-foreground mt-1">GH₵ {(byMethod[0]?.value || 0).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-2">
              {byMethod.length > 0 ? `${((byMethod[0].value / (outstanding || 1)) * 100).toFixed(0)}% of total payments` : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Payment Trends</CardTitle></CardHeader>
        <CardContent>
          {trend.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                <YAxis tickFormatter={v => `₵${v}`} className="text-xs fill-muted-foreground" />
                <Tooltip formatter={(v: number) => [`GH₵ ${v.toFixed(2)}`, 'Payments']} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stock Insights ──
export function StockInsights({ products, stockMovements }: { products: any[]; stockMovements: any[] }) {
  const { lowStock, deadStock, movementTrend } = useMemo(() => {
    const lowStock = products.filter(p => p.qty > 0 && p.qty <= p.reorder_level).sort((a, b) => a.qty - b.qty);

    // Dead stock: products with no movements in the period
    const movedProducts = new Set(stockMovements.map(m => m.product_id));
    const deadStock = products.filter(p => p.qty > 0 && !movedProducts.has(p.id)).sort((a, b) => Number(b.cost_price) * b.qty - Number(a.cost_price) * a.qty);

    // Movement trend
    const dailyMap: Record<string, { in: number; out: number }> = {};
    stockMovements.forEach(m => {
      const day = new Date(m.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      if (!dailyMap[day]) dailyMap[day] = { in: 0, out: 0 };
      if (m.movement_type === 'in') dailyMap[day].in += m.quantity;
      else if (m.movement_type === 'out') dailyMap[day].out += m.quantity;
    });
    const movementTrend = Object.entries(dailyMap).map(([date, d]) => ({ date, ...d }));

    return { lowStock, deadStock, movementTrend };
  }, [products, stockMovements]);

  const deadStockValue = deadStock.reduce((s, p) => s + Number(p.cost_price) * p.qty, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Low Stock Items</p>
          <p className={cn('text-xl font-bold', lowStock.length > 0 ? 'text-destructive' : 'text-accent')}>{lowStock.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Dead Stock Items</p>
          <p className="text-xl font-bold text-destructive">{deadStock.length}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-muted-foreground">Dead Stock Value</p>
          <p className="text-xl font-bold">GH₵ {deadStockValue.toFixed(2)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Stock Movement Trends</CardTitle></CardHeader>
        <CardContent>
          {movementTrend.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={movementTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                <YAxis className="text-xs fill-muted-foreground" />
                <Tooltip />
                <Legend />
                <Bar dataKey="in" fill="hsl(var(--accent))" name="Stock In" radius={[4, 4, 0, 0]} />
                <Bar dataKey="out" fill="hsl(var(--destructive))" name="Stock Out" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Low Stock Products</CardTitle></CardHeader>
          <CardContent>
            {lowStock.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">All stock levels healthy</p> : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {lowStock.slice(0, 15).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="text-destructive font-medium">{p.qty} / {p.reorder_level}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Dead Stock (No Movement)</CardTitle></CardHeader>
          <CardContent>
            {deadStock.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">All products have recent movement</p> : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {deadStock.slice(0, 15).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">Qty: {p.qty} · GH₵ {(Number(p.cost_price) * p.qty).toFixed(2)}</span>
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

// ── Helper Components ──

function EmptyState() {
  return <p className="text-sm text-muted-foreground text-center py-8">No data available for this period.</p>;
}

function RankedList({ title, items, valueKey, format }: { title: string; items: any[]; valueKey: string; format: (v: number) => string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <EmptyState /> : (
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    i < 3 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground')}>{i + 1}</span>
                  <span className="font-medium">{item.name}</span>
                </span>
                <span className="text-muted-foreground">{format(item[valueKey])}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
