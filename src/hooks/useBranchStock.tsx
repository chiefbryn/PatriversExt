import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOutlets, type Outlet } from '@/hooks/useOutlets';
import { getOfflineMeta, setOfflineMeta } from '@/lib/offlineDb';

export interface BranchStockCell {
  quantity: number;
  updated_at: string | null;
}

export interface BranchStockRow {
  product_id: string;
  name: string;
  category: string;
  uom: string;
  sales_price: number;
  cost_price: number;
  reorder_level: number;
  expiry_date: string | null;
  total_qty: number;
  byOutlet: Record<string, BranchStockCell>;
}

interface RawOutletStock { outlet_id: string; product_id: string; quantity: number; updated_at: string }
interface RawProduct { id: string; name: string; category: string; uom: string; sales_price: number; cost_price: number; reorder_level: number; expiry_date: string | null; qty: number }

/** Per-branch quantity for every product. Low stock at a branch = quantity at or below the product reorder level. */
export function useBranchStock() {
  const { data: outlets = [] } = useOutlets();
  const activeOutlets = outlets.filter(o => o.is_active);

  const q = useQuery({
    queryKey: ['branch-stock'],
    queryFn: async () => {
      if (!navigator.onLine) return (await getOfflineMeta<BranchStockRow[]>('branch-stock')) || [];
      const [{ data: products, error: pe }, { data: stock, error: se }] = await Promise.all([
        supabase.from('products').select('id, name, category, uom, sales_price, cost_price, reorder_level, expiry_date, qty').order('name').limit(10000),
        supabase.from('outlet_stock' as any).select('outlet_id, product_id, quantity, updated_at').limit(50000),
      ]);
      if (pe) throw pe;
      if (se) throw se;
      const cells = new Map<string, Record<string, BranchStockCell>>();
      for (const s of (stock || []) as unknown as RawOutletStock[]) {
        if (!cells.has(s.product_id)) cells.set(s.product_id, {});
        cells.get(s.product_id)![s.outlet_id] = { quantity: Number(s.quantity), updated_at: s.updated_at };
      }
      const rows: BranchStockRow[] = ((products || []) as RawProduct[]).map(p => ({
        product_id: p.id,
        name: p.name,
        category: p.category,
        uom: p.uom,
        sales_price: Number(p.sales_price),
        cost_price: Number(p.cost_price),
        reorder_level: Number(p.reorder_level),
        expiry_date: p.expiry_date,
        total_qty: Number(p.qty),
        byOutlet: cells.get(p.id) || {},
      }));
      await setOfflineMeta('branch-stock', rows);
      return rows;
    },
    staleTime: 60 * 1000,
  });

  return { rows: q.data || [], outlets: activeOutlets as Outlet[], isLoading: q.isLoading, dataUpdatedAt: q.dataUpdatedAt, refetch: q.refetch };
}

export function branchQty(row: BranchStockRow, outletId: string) {
  return row.byOutlet[outletId]?.quantity ?? 0;
}

export function isLowAtBranch(row: BranchStockRow, outletId: string) {
  const qty = branchQty(row, outletId);
  return qty <= row.reorder_level;
}
