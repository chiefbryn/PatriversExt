import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useOutlets } from '@/hooks/useOutlets';
import { useBranchStock, branchQty } from '@/hooks/useBranchStock';
import { cn } from '@/lib/utils';

const UNASSIGNED = '__none__';
const fmt = (n: number) => `GH₵ ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayKey = (d: Date) => d.toISOString().split('T')[0];

type Period = 'today' | 'week' | 'month';

function periodStart(p: Period) {
  const d = new Date();
  if (p === 'week') d.setDate(d.getDate() - 6);
  if (p === 'month') d.setDate(1);
  return dayKey(d) + 'T00:00:00';
}

export default function CeoDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>('month');
  const [branch, setBranch] = useState<string>('all');
  const { data: outlets = [] } = useOutlets();
  const { rows: stockRows, outlets: activeOutlets } = useBranchStock();
  const from = periodStart(period);

  const outletName = (id: string | null) => outlets.find(o => o.id === id)?.name || 'Unassigned';

  // Sales in period, with cost of goods from line items.
  const { data: sales = [] } = useQuery({
    queryKey: ['ceo-sales', from],
    queryFn: async () => {
      const { data: s } = await supabase.from('sales').select('id, total, outlet_id, created_at, sale_type, cashier_id').gte('created_at', from).neq('status', 'voided').limit(10000);
      const list = s || [];
      if (list.length === 0) return [];
      const costBySale: Record<string, number> = {};
      const ids = list.map(x => x.id);
      for (let i = 0; i < ids.length; i += 500) {
        const { data: items } = await supabase.from('sale_items').select('sale_id, quantity, products(cost_price)').in('sale_id', ids.slice(i, i + 500)).limit(10000);
        (items || []).forEach((it: any) => { costBySale[it.sale_id] = (costBySale[it.sale_id] || 0) + Number(it.quantity) * Number(it.products?.cost_price || 0); });
      }
      return list.map(x => ({ ...x, cost: costBySale[x.id] || 0 }));
    },
    refetchInterval: 60000,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['ceo-expenses', from],
    queryFn: async () => {
      const { data } = await supabase.from('documents').select('total, outlet_id, created_at, sub_type').eq('category', 'Expenses').neq('status', 'voided').gte('created_at', from).limit(10000);
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: pendingReqs = [] } = useQuery({
    queryKey: ['ceo-pending-reqs'],
    queryFn: async () => {
      const { data } = await supabase.from('requisitions').select('id, product_name, quantity_needed, urgency, outlet_id, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(50);
      return (data || []) as any[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel('ceo-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => qc.invalidateQueries({ queryKey: ['ceo-sales'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => qc.invalidateQueries({ queryKey: ['ceo-expenses'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outlet_stock' }, () => qc.invalidateQueries({ queryKey: ['branch-stock'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requisitions' }, () => qc.invalidateQueries({ queryKey: ['ceo-pending-reqs'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const inBranch = (outletId: string | null) => branch === 'all' || (branch === UNASSIGNED ? !outletId : outletId === branch);
  const fSales = sales.filter(s => inBranch(s.outlet_id));
  const fExpenses = expenses.filter(e => inBranch(e.outlet_id));

  const revenue = fSales.reduce((a, s) => a + Number(s.total), 0);
  const cogs = fSales.reduce((a, s) => a + s.cost, 0);
  const expenseTotal = fExpenses.reduce((a, e) => a + Number(e.total), 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenseTotal;
  const wholesale = fSales.filter(s => s.sale_type === 'wholesale').reduce((a, s) => a + Number(s.total), 0);

  // Per-branch table
  const branchRows = useMemo(() => {
    const ids: (string | null)[] = [...outlets.map(o => o.id)];
    if (sales.some(s => !s.outlet_id) || expenses.some(e => !e.outlet_id)) ids.push(null);
    return ids.map(id => {
      const bs = sales.filter(s => s.outlet_id === id);
      const be = expenses.filter(e => e.outlet_id === id);
      const rev = bs.reduce((a, s) => a + Number(s.total), 0);
      const cost = bs.reduce((a, s) => a + s.cost, 0);
      const exp = be.reduce((a, e) => a + Number(e.total), 0);
      const low = id ? stockRows.filter(r => { const q = branchQty(r, id); return q > 0 && q <= r.reorder_level; }).length : 0;
      const out = id ? stockRows.filter(r => branchQty(r, id) <= 0).length : 0;
      return { id, name: outletName(id), count: bs.length, rev, cost, exp, gross: rev - cost, net: rev - cost - exp, low, out };
    });
  }, [outlets, sales, expenses, stockRows]);

  // Daily revenue per branch for the chart (last 7 days regardless of period selector).
  const chart = useMemo(() => {
    const days: Record<string, any>[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = dayKey(d);
      const row: Record<string, any> = { date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), _k: k };
      outlets.forEach(o => { row[o.name] = 0; });
      days.push(row);
    }
    sales.forEach(s => {
      const k = s.created_at.slice(0, 10);
      const row = days.find(r => r._k === k);
      if (!row) return;
      const name = outletName(s.outlet_id);
      row[name] = (row[name] || 0) + Number(s.total);
    });
    return days;
  }, [sales, outlets]);

  const palette = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--destructive))', 'hsl(var(--muted-foreground))'];

  const lowest = useMemo(() => {
    const items: { name: string; branch: string; qty: number; level: number }[] = [];
    for (const r of stockRows) for (const o of activeOutlets) {
      const q = branchQty(r, o.id);
      if (q <= r.reorder_level) items.push({ name: r.name, branch: o.name, qty: q, level: r.reorder_level });
    }
    return items.sort((a, b) => a.qty - b.qty).slice(0, 10);
  }, [stockRows, activeOutlets]);

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Executive overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Sales, profit and stock across all branches.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border">
            {(['today', 'week', 'month'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={cn('px-3 py-1.5 text-xs font-medium border-r last:border-r-0', period === p ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/50')}>
                {p === 'today' ? 'Today' : p === 'week' ? 'Last 7 days' : 'This month'}
              </button>
            ))}
          </div>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-44"><span>{branch === 'all' ? 'All branches' : branch === UNASSIGNED ? 'Unassigned records' : outletName(branch)}</span></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              <SelectItem value={UNASSIGNED}>Unassigned records</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-border border">
        {[
          { label: 'Revenue', value: fmt(revenue), sub: `${fSales.length} sales` },
          { label: 'Cost of goods', value: fmt(cogs), sub: 'From product cost prices' },
          { label: 'Gross profit', value: fmt(grossProfit), sub: revenue > 0 ? `${((grossProfit / revenue) * 100).toFixed(1)}% margin` : '' },
          { label: 'Expenses', value: fmt(expenseTotal), sub: `${fExpenses.length} entries` },
          { label: 'Net profit', value: fmt(netProfit), sub: wholesale > 0 ? `${fmt(wholesale)} wholesale` : '', strong: true },
        ].map(k => (
          <div key={k.label} className="bg-card px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className={cn('mt-2 text-xl font-semibold', k.strong && netProfit < 0 && 'text-destructive')}>{k.value}</p>
            {k.sub && <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 rounded-none shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base font-medium">Branch performance</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Low / out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchRows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No branches set up yet</TableCell></TableRow>}
                {branchRows.map(b => (
                  <TableRow key={b.id ?? 'none'} className={cn(branch === (b.id ?? UNASSIGNED) && 'bg-muted/40')}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-right">{b.count}</TableCell>
                    <TableCell className="text-right">{fmt(b.rev)}</TableCell>
                    <TableCell className="text-right">{fmt(b.gross)}</TableCell>
                    <TableCell className="text-right">{fmt(b.exp)}</TableCell>
                    <TableCell className={cn('text-right font-semibold', b.net < 0 && 'text-destructive')}>{fmt(b.net)}</TableCell>
                    <TableCell className="text-right">{b.id ? <span>{b.low} <span className="text-muted-foreground">/</span> <span className={cn(b.out > 0 && 'text-destructive')}>{b.out}</span></span> : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 rounded-none shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base font-medium">Daily revenue by branch, last 7 days</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                <YAxis tickFormatter={v => `₵${v}`} className="text-xs fill-muted-foreground" width={60} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                {outlets.map((o, i) => <Bar key={o.id} dataKey={o.name} stackId="a" fill={palette[i % palette.length]} />)}
                {sales.some(s => !s.outlet_id) && <Bar dataKey="Unassigned" stackId="a" fill={palette[3]} />}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="rounded-none shadow-none">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Needs reordering</CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate('/ceo/stock')}>Open stock by branch</Button>
          </CardHeader>
          <CardContent className="p-0">
            {lowest.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Every branch is above its reorder level</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Drug</TableHead><TableHead>Branch</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Reorder at</TableHead></TableRow></TableHeader>
                <TableBody>
                  {lowest.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell>{l.branch}</TableCell>
                      <TableCell className={cn('text-right', l.qty <= 0 ? 'text-destructive font-semibold' : 'font-medium')}>{l.qty}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{l.level}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-none shadow-none">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Pending requisitions</CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate('/requisitions')}>View all</Button>
          </CardHeader>
          <CardContent className="p-0">
            {pendingReqs.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nothing waiting</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Drug</TableHead><TableHead>Branch</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Urgency</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pendingReqs.slice(0, 10).map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.product_name}</TableCell>
                      <TableCell>{outletName(r.outlet_id)}</TableCell>
                      <TableCell className="text-right">{r.quantity_needed}</TableCell>
                      <TableCell className={cn('capitalize', r.urgency === 'high' && 'text-destructive')}>{r.urgency}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
