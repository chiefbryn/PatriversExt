import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DateRange = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export function getDateBounds(range: DateRange, customFrom?: string, customTo?: string) {
  const now = new Date();
  let from: string, to: string;
  to = now.toISOString().split('T')[0];

  switch (range) {
    case 'today':
      from = to;
      break;
    case 'week': {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      from = d.toISOString().split('T')[0];
      break;
    }
    case 'quarter': {
      const d = new Date(now); d.setMonth(d.getMonth() - 3);
      from = d.toISOString().split('T')[0];
      break;
    }
    case 'year': {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1);
      from = d.toISOString().split('T')[0];
      break;
    }
    case 'custom':
      from = customFrom || to;
      to = customTo || to;
      break;
    default: {
      const d = new Date(now); d.setMonth(d.getMonth() - 1);
      from = d.toISOString().split('T')[0];
      break;
    }
  }
  return { from: from + 'T00:00:00', to: to + 'T23:59:59' };
}

// Sales data
export function useSalesReport(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['report-sales', from, to],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });
}

// Sale items with product info
export function useSaleItemsReport(saleIds: string[], enabled: boolean) {
  // Build a stable cache key from the actual id list (not just length) so
  // two different date windows that happen to return the same row-count don't
  // share a cached result.
  const idKey = [...saleIds].sort().join('|');
  return useQuery<any[]>({
    queryKey: ['report-sale-items', idKey],
    enabled: enabled && saleIds.length > 0,
    queryFn: async () => {
      // Supabase caps responses at 1000 by default; bump it so large windows
      // return every line item.
      const chunkSize = 500;
      const out: any[] = [];
      for (let i = 0; i < saleIds.length; i += chunkSize) {
        const slice = saleIds.slice(i, i + chunkSize);
        const { data } = await supabase
          .from('sale_items')
          .select('*, products(name, category, cost_price)')
          .in('sale_id', slice)
          .limit(10000);
        if (data) out.push(...data);
      }
      return out as any[];
    },
  });
}

// Documents (expenses, purchases, etc.)
export function useDocumentsReport(from: string, to: string, enabled: boolean, filters?: { category?: string; status?: string; payment_status?: string }) {
  return useQuery({
    queryKey: ['report-documents', from, to, filters],
    enabled,
    queryFn: async () => {
      let q = supabase
        .from('documents')
        .select('*, document_types(code, name, prefix, category, affects_stock)')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      if (filters?.category && filters.category !== 'all') q = q.eq('category', filters.category);
      if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters?.payment_status && filters.payment_status !== 'all') q = q.eq('payment_status', filters.payment_status);

      const { data } = await q.limit(500);
      return (data || []) as any[];
    },
  });
}

// Payments
export function usePaymentsReport(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['report-payments', from, to],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('payments')
        .select('*, payment_types(name, code), documents(doc_number, category, sub_type, customer_name)')
        .gte('paid_at', from)
        .lte('paid_at', to)
        .order('paid_at', { ascending: false })
        .limit(500);
      return (data || []) as any[];
    },
  });
}

// Stock movements
export function useStockMovementsReport(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['report-stock-movements', from, to],
    enabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_movements')
        .select('*, products(name, category)')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
        .limit(500);
      return (data || []) as any[];
    },
  });
}

// Activity log
export function useActivityReport(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['report-activity', from, to],
    enabled,
    queryFn: async () => {
      const { data: logs } = await supabase
        .from('activity_log')
        .select('*')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
        .limit(500);

      if (!logs || logs.length === 0) return [];

      const userIds = [...new Set(logs.map(l => l.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      const nameMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
      return logs.map(l => ({ ...l, user_name: nameMap.get(l.user_id) || 'Unknown' }));
    },
  });
}

// Products
export function useProductsReport(enabled: boolean) {
  return useQuery({
    queryKey: ['report-products'],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').order('name').limit(10000);
      return data || [];
    },
  });
}

// Profiles
export function useProfilesReport(enabled: boolean) {
  return useQuery({
    queryKey: ['report-profiles'],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, full_name');
      return data || [];
    },
  });
}

// CSV export helper
export function exportCSV(headers: string[], rows: string[][], filename: string) {
  const escapeCsv = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const csv = [headers.map(escapeCsv).join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
