import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { cacheProducts, getCachedProducts, type OfflineProduct } from '@/lib/offlineDb';

export type Product = Tables<'products'>;
export type ProductInsert = TablesInsert<'products'>;
export type ProductUpdate = TablesUpdate<'products'>;

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => fetchAllProducts(),
  });
}

/**
 * Page through ALL products. PostgREST caps single responses at 1000 rows
 * regardless of .limit(), so we must use .range() until exhausted.
 */
export async function fetchAllProducts(): Promise<Product[]> {
  if (!navigator.onLine) return (await getCachedProducts()) as Product[];
  const PAGE = 1000;
  const all: Product[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Product[]));
    if (data.length < PAGE) break;
  }
  const { data: { user } } = await supabase.auth.getUser();
  let outletId: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('outlet_id').eq('user_id', user.id).maybeSingle();
    outletId = (profile as { outlet_id?: string | null } | null)?.outlet_id || null;
  }
  let products = all;
  if (outletId) {
    const { data: stock } = await supabase.from('outlet_stock' as never).select('product_id, quantity').eq('outlet_id', outletId);
    const quantityByProduct = new Map(((stock || []) as unknown as Array<{ product_id: string; quantity: number }>).map(row => [row.product_id, row.quantity]));
    products = all.map(product => ({ ...product, qty: quantityByProduct.get(product.id) ?? 0 }));
  }
  const cachedAt = new Date().toISOString();
  await cacheProducts(products.map(product => ({ ...product, cached_at: cachedAt })) as OfflineProduct[]);
  return products;
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (product: ProductInsert) => {
      const { data, error } = await supabase.from('products').insert(product).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: ProductUpdate & { id: string }) => {
      const { data, error } = await supabase.from('products').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

/** Bulk soft-deactivate (block) products by setting status='inactive'. */
export function useBulkSetProductStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: 'active' | 'inactive' }) => {
      const { error } = await supabase.from('products').update({ status }).in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

/** Bulk hard-delete (admin-only at RLS level). */
export function useBulkDeleteProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc('bulk_delete_products' as any, { p_ids: ids });
      if (error) throw error;
      return (data as number) ?? ids.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

/**
 * Subscribe to live product + stock changes so any screen using product data
 * refreshes automatically when records change anywhere in the system.
 */
export function useProductsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel('products-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        qc.invalidateQueries({ queryKey: ['products'] });
        qc.invalidateQueries({ queryKey: ['stock'] });
        qc.invalidateQueries({ queryKey: ['stock_by_date'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => {
        qc.invalidateQueries({ queryKey: ['products'] });
        qc.invalidateQueries({ queryKey: ['stock'] });
        qc.invalidateQueries({ queryKey: ['stock_movements'] });
        qc.invalidateQueries({ queryKey: ['stock_by_date'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);
}
