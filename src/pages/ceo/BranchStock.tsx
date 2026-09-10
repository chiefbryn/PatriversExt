import { useMemo, useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useBranchStock, branchQty, isLowAtBranch, type BranchStockRow } from '@/hooks/useBranchStock';
import { RequestRestockDialog } from '@/components/RequestRestockDialog';
import { RecordsToolbar } from '@/components/RecordsToolbar';
import { TableRowsSkeleton } from '@/components/LoadingSkeletons';

type View = 'all' | 'low' | 'out';

export default function BranchStock() {
  const { rows, outlets, isLoading, dataUpdatedAt, refetch } = useBranchStock();
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState<string>('all');
  const [view, setView] = useState<View>('all');
  const [reorder, setReorder] = useState<{ name: string; qty: number; uom: string; outletId: string; outletName: string } | null>(null);

  const shownOutlets = branch === 'all' ? outlets : outlets.filter(o => o.id === branch);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r => {
      if (s && !r.name.toLowerCase().includes(s) && !r.category.toLowerCase().includes(s)) return false;
      if (view === 'all') return true;
      return shownOutlets.some(o => {
        const q = branchQty(r, o.id);
        return view === 'out' ? q <= 0 : q <= r.reorder_level;
      });
    });
  }, [rows, search, view, shownOutlets]);

  const lowCounts = useMemo(() => {
    const m: Record<string, { low: number; out: number }> = {};
    for (const o of outlets) {
      m[o.id] = { low: 0, out: 0 };
      for (const r of rows) {
        const q = branchQty(r, o.id);
        if (q <= 0) m[o.id].out++;
        else if (q <= r.reorder_level) m[o.id].low++;
      }
    }
    return m;
  }, [rows, outlets]);

  const cellClass = (r: BranchStockRow, outletId: string) => {
    const q = branchQty(r, outletId);
    if (q <= 0) return 'text-destructive font-semibold';
    if (q <= r.reorder_level) return 'text-warning-foreground bg-warning/20 font-medium';
    return '';
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock by branch</h1>
          <p className="text-sm text-muted-foreground mt-1">Quantity of every drug at each branch. Reorder from here when a branch runs low.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>Refresh</Button>
          <RecordsToolbar
            disabled={filtered.length === 0}
            getData={() => ({
              title: 'Stock by branch',
              subtitle: `${filtered.length} products`,
              filename: 'stock_by_branch',
              headers: ['#', 'Drug', 'Unit', 'Reorder at', ...shownOutlets.map(o => o.name), 'Total'],
              alignRight: [3, ...shownOutlets.map((_, i) => 4 + i), 4 + shownOutlets.length],
              rows: filtered.map((r, i) => [i + 1, r.name, r.uom, r.reorder_level, ...shownOutlets.map(o => branchQty(r, o.id)), r.total_qty]),
            })}
          />
        </div>
      </div>

      {outlets.length === 0 ? (
        <Card><CardContent className="py-10 text-sm text-muted-foreground">No branches have been set up yet. Ask an administrator to add them under Outlets.</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-px bg-border border" style={{ gridTemplateColumns: `repeat(${Math.min(outlets.length, 4)}, minmax(0, 1fr))` }}>
            {outlets.map(o => (
              <button
                key={o.id}
                onClick={() => setBranch(branch === o.id ? 'all' : o.id)}
                className={cn('bg-card text-left px-5 py-4 transition-colors hover:bg-muted/40', branch === o.id && 'bg-muted/60')}
              >
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{o.name}</p>
                <div className="mt-2 flex items-baseline gap-4">
                  <span><span className="text-2xl font-semibold">{lowCounts[o.id]?.low ?? 0}</span> <span className="text-xs text-muted-foreground">low</span></span>
                  <span><span className="text-2xl font-semibold text-destructive">{lowCounts[o.id]?.out ?? 0}</span> <span className="text-xs text-muted-foreground">out</span></span>
                </div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Input className="max-w-xs" placeholder="Search drug or category" value={search} onChange={e => setSearch(e.target.value)} />
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-48"><span>{branch === 'all' ? 'All branches' : outlets.find(o => o.id === branch)?.name}</span></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {outlets.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex border">
              {(['all', 'low', 'out'] as View[]).map(v => (
                <button key={v} onClick={() => setView(v)} className={cn('px-3 py-1.5 text-xs font-medium border-r last:border-r-0', view === v ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted/50')}>
                  {v === 'all' ? 'Everything' : v === 'low' ? 'Low or out' : 'Out of stock'}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {rows.length} products</span>
          </div>

          <div className="border overflow-x-auto bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Drug</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Reorder at</TableHead>
                  {shownOutlets.map(o => <TableHead key={o.id} className="text-right">{o.name}</TableHead>)}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRowsSkeleton columns={6 + shownOutlets.length} />}
                {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={6 + shownOutlets.length} className="py-10 text-center text-muted-foreground">Nothing matches this view</TableCell></TableRow>}
                {filtered.map(r => {
                  const worst = shownOutlets.reduce<{ id: string; name: string; qty: number } | null>((acc, o) => {
                    const q = branchQty(r, o.id);
                    return !acc || q < acc.qty ? { id: o.id, name: o.name, qty: q } : acc;
                  }, null);
                  const anyLow = shownOutlets.some(o => isLowAtBranch(r, o.id));
                  return (
                    <TableRow key={r.product_id}>
                      <TableCell>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.category}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.uom}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.reorder_level}</TableCell>
                      {shownOutlets.map(o => {
                        const cell = r.byOutlet[o.id];
                        return (
                          <TableCell key={o.id} className={cn('text-right', cellClass(r, o.id))} title={cell?.updated_at ? `Updated ${format(new Date(cell.updated_at), 'dd/MM/yyyy HH:mm')}` : 'No movement recorded'}>
                            {branchQty(r, o.id)}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-semibold">{r.total_qty}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.expiry_date ? format(new Date(r.expiry_date), 'dd/MM/yyyy') : ''}</TableCell>
                      <TableCell className="text-right">
                        {worst && (
                          <Button size="sm" variant={anyLow ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setReorder({ name: r.name, qty: worst.qty, uom: r.uom, outletId: worst.id, outletName: worst.name })}>
                            Reorder{shownOutlets.length > 1 ? ` for ${worst.name}` : ''}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {dataUpdatedAt > 0 && <p className="text-xs text-muted-foreground">Figures refreshed {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}. Low means at or below the reorder level.</p>}
        </>
      )}

      <RequestRestockDialog product={reorder} onClose={() => setReorder(null)} />
    </div>
  );
}
