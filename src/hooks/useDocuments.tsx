import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { enqueueOffline, getCachedProducts, getDeviceKey, getOfflineAuthorization, getOfflineMeta, increaseCachedStock, setOfflineMeta } from '@/lib/offlineDb';

export interface DocumentType {
  id: string;
  code: string;
  name: string;
  category: string;
  prefix: string;
  affects_stock: string;
  is_active: boolean;
}

export interface DocumentItem {
  id: string;
  document_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  amount: number;
  batch_number: string | null;
  expiry_date: string | null;
  notes: string | null;
  products?: { id: string; name: string; category: string };
}

export interface Document {
  id: string;
  doc_number: string | null;
  category: string;
  sub_type: string;
  status: string;
  customer_name: string | null;
  external_ref: string | null;
  notes: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  payment_status: string;
  quantity: number;
  user_id: string;
  document_type_id: string | null;
  created_at: string;
  metadata?: Record<string, any>;
  updated_at: string;
  document_items?: DocumentItem[];
  document_types?: DocumentType;
  products?: { name: string };
}

export interface Payment {
  id: string;
  document_id: string;
  amount: number;
  reference: string | null;
  paid_by: string | null;
  status: string;
  paid_at: string;
  payment_types?: { name: string; code: string } | null;
}

export interface AuditEntry {
  id: string;
  document_id: string;
  action: string;
  old_values: any;
  new_values: any;
  performed_by: string;
  created_at: string;
  performed_by_name?: string;
}

// Fetch document types from DB
export function useDocumentTypes() {
  return useQuery<DocumentType[]>({
    queryKey: ['document_types'],
    queryFn: async () => {
      if (!navigator.onLine) return (await getOfflineMeta<DocumentType[]>('document_types')) || [];
      const { data, error } = await supabase
        .from('document_types')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('name');
      if (error) throw error;
      const types = (data || []) as unknown as DocumentType[];
      await setOfflineMeta('document_types', types);
      return types;
    },
  });
}

// Categories derived from document types
export function useDocumentCategories() {
  const { data: types = [] } = useDocumentTypes();
  const categories = [...new Set(types.map(t => t.category))];
  const subTypes = types.reduce<Record<string, DocumentType[]>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});
  return { categories, subTypes, types };
}

// Document list with filters
export function useDocumentList(filters: Record<string, string>) {
  return useQuery<Document[]>({
    queryKey: ['documents', filters],
    queryFn: async () => {
      let q = supabase
        .from('documents')
        .select('*, document_items(id), products(name)')
        .order('created_at', { ascending: false });

      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category);
      if (filters.payment_status && filters.payment_status !== 'all') q = q.eq('payment_status', filters.payment_status);
      if (filters.search) q = q.or(`doc_number.ilike.%${filters.search}%,external_ref.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%`);
      if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom);
      if (filters.dateTo) q = q.lte('created_at', filters.dateTo + 'T23:59:59');

      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data || []) as unknown as Document[];
    },
  });
}

// Single document with items
export function useDocument(id: string | null) {
  return useQuery<Document | null>({
    queryKey: ['document', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, document_items(*, products(id, name, category)), document_types(code, name, prefix, affects_stock)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as unknown as Document;
    },
  });
}

// Payments for a document
export function useDocumentPayments(documentId: string | null) {
  return useQuery<Payment[]>({
    queryKey: ['document_payments', documentId],
    enabled: !!documentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, payment_types(name, code)')
        .eq('document_id', documentId!)
        .order('paid_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Payment[];
    },
  });
}

// Audit log for a document
export function useDocumentAuditLog(documentId: string | null) {
  return useQuery<AuditEntry[]>({
    queryKey: ['document_audit', documentId],
    enabled: !!documentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_audit_log')
        .select('*')
        .eq('document_id', documentId!)
        .order('created_at', { ascending: true });
      if (error) {
        // User may not have access (non-admin) — return empty
        return [];
      }
      // Resolve user names
      const userIds = [...new Set((data || []).map((d: any) => d.performed_by))];
      if (userIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);
      const map = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
      return (data || []).map((entry: any) => ({
        ...entry,
        performed_by_name: map.get(entry.performed_by) || 'System',
      }));
    },
  });
}

// Products for picker
export function useProductSearch(term: string) {
  return useQuery({
    queryKey: ['products_search', term],
    enabled: term.length >= 2,
    queryFn: async () => {
      if (!navigator.onLine) {
        const products = await getCachedProducts();
        const value = term.toLowerCase();
        return products.filter(product => product.status === 'active' && (product.name.toLowerCase().includes(value) || product.category.toLowerCase().includes(value))).slice(0, 10);
      }
      const { data } = await supabase
        .from('products')
        .select('id, name, category, qty, cost_price, sales_price, uom')
        .eq('status', 'active')
        .or(`name.ilike.%${term}%,category.ilike.%${term}%`)
        .order('name')
        .limit(10);
      return data || [];
    },
  });
}

// Payment types
export function usePaymentTypes() {
  return useQuery({
    queryKey: ['payment_types'],
    queryFn: async () => {
      if (!navigator.onLine) return (await getOfflineMeta<any[]>('payment_types')) || [];
      const { data } = await supabase
        .from('payment_types')
        .select('*')
        .eq('is_active', true)
        .order('name');
      const rows = data || [];
      await setOfflineMeta('payment_types', rows);
      return rows;
    },
  });
}

// Mutations
export function useDocumentMutations() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['document'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['document_payments'] });
    qc.invalidateQueries({ queryKey: ['document_audit'] });
  };

  const callApi = async (action: string, body?: any) => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const resp = await fetch(
      `${supabaseUrl}/functions/v1/manage-documents?action=${encodeURIComponent(action)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body || {}),
      }
    );
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || `Request failed (${resp.status})`);
    return result;
  };

  const createDraft = useMutation({
    mutationFn: (data: {
      category: string;
      sub_type: string;
      document_type_id?: string;
      external_ref?: string;
      customer_name?: string;
      notes?: string;
      tax?: number;
      discount?: number;
      metadata?: Record<string, any>;
      items?: any[];
    }) => {
      if (navigator.onLine) return callApi('create_draft', data);
      if (!user) throw new Error('Offline authorization is required');
      if (data.category !== 'Expenses' && data.category !== 'Purchases') throw new Error('This document type requires an internet connection');
      return (async () => {
        const clientId = crypto.randomUUID();
        const cachedAuth = await getOfflineAuthorization(user.id);
        const outletId = cachedAuth?.outletId;
        if (!outletId) throw new Error('No outlet is assigned to this device');
        const deviceKey = cachedAuth.deviceKey || getDeviceKey(user.id);
        const createdAt = new Date().toISOString();
        const payload = {
          p_user_id: user.id, p_category: data.category, p_sub_type: data.sub_type,
          p_document_type_id: data.document_type_id || null, p_external_ref: data.external_ref || null,
          p_customer_name: data.customer_name || null, p_notes: data.notes || null,
          p_tax: data.tax || 0, p_discount: data.discount || 0, p_amount: (data as any).amount || null,
          p_metadata: data.metadata || {}, p_items: data.items || [], p_outlet_id: outletId,
          p_client_id: clientId, p_device_id: deviceKey, p_created_at: createdAt,
        };
        await enqueueOffline({ id: clientId, kind: 'document', userId: user.id, outletId, deviceKey, createdAt, payload });
        if (data.category === 'Purchases') await increaseCachedStock((data.items || []) as any[]);
        window.dispatchEvent(new CustomEvent('patrivers-sync-change'));
        return { id: clientId, offline: true, status: 'pending_sync' };
      })();
    },
    onSuccess: (data) => {
      toast.success((data as any)?.offline ? 'Saved on this device. It will sync automatically.' : 'Draft document created');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addItem = useMutation({
    mutationFn: (data: { document_id: string; product_id: string; quantity: number; unit_price: number; batch_number?: string; expiry_date?: string }) =>
      callApi('add_item', data),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: (data: { item_id: string; quantity?: number; unit_price?: number }) =>
      callApi('update_item', data),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: (data: { item_id: string }) => callApi('remove_item', data),
    onSuccess: () => { invalidate(); toast.success('Item removed'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateDraft = useMutation({
    mutationFn: (data: { document_id: string; [key: string]: any }) => callApi('update_draft', data),
    onSuccess: () => { invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmDoc = useMutation({
    mutationFn: (data: { document_id: string }) => callApi('confirm', data),
    onSuccess: (result) => {
      const movements = Number(result.movements_created || 0);
      const stockMsg = result.stock_affected && movements > 0
        ? ` — stock auto-updated (${movements} movement${movements !== 1 ? 's' : ''})`
        : '';
      toast.success(`Document ${result.doc_number} confirmed${stockMsg}`);
      invalidate();
      // Make sure inventory views refresh after stock changes
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['stock_movements'] });
      qc.invalidateQueries({ queryKey: ['stock-by-date'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const voidDoc = useMutation({
    mutationFn: (data: { document_id: string; reason: string }) => callApi('void', data),
    onSuccess: () => { toast.success('Document voided'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addPayment = useMutation({
    mutationFn: (data: { document_id: string; amount: number; payment_type_id?: string; reference?: string; paid_by?: string }) =>
      callApi('add_payment', data),
    onSuccess: (result) => {
      toast.success(`Payment recorded — Balance: GH₵ ${Number(result.balance_due).toFixed(2)}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editHistorical = useMutation({
    mutationFn: (data: {
      document_id: string;
      items?: { item_id: string; quantity?: number; unit_price?: number }[];
      new_items?: { product_id: string; quantity: number; unit_price: number }[];
      removed_item_ids?: string[];
      propagate_duplicates?: boolean;
    }) => callApi('edit_historical', data),
    onSuccess: (result) => {
      const dup = Number(result.duplicate_docs || 0);
      const prop = Number(result.propagated_count || 0);
      const added = Number(result.added_count || 0);
      const removed = Number(result.removed_count || 0);
      const extras: string[] = [];
      if (added) extras.push(`${added} added`);
      if (removed) extras.push(`${removed} removed`);
      if (dup > 0) extras.push(`propagated to ${dup} duplicate doc(s) (${prop} line(s))`);
      const extra = extras.length ? ` (${extras.join(', ')})` : '';
      toast.success(`Historical edit saved — ${result.changes_count || 0} change(s).${extra} Stock rebuilt.`);
      invalidate();
      qc.invalidateQueries({ queryKey: ['stock_movements'] });
      qc.invalidateQueries({ queryKey: ['stock-by-date'] });
      qc.invalidateQueries({ queryKey: ['sbd-movements'] });
      qc.invalidateQueries({ queryKey: ['sbd-after-movements'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { createDraft, addItem, updateItem, removeItem, updateDraft, confirmDoc, voidDoc, addPayment, editHistorical };
}

/** Bulk cancel (soft-block) and bulk hard-delete document records. */
export function useBulkDocumentActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['document'] });
  };
  const bulkCancel = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('documents').update({ status: 'cancelled' }).in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => { toast.success(`${n} document(s) cancelled`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc('bulk_delete_documents' as any, { p_ids: ids });
      if (error) throw error;
      return (data as number) ?? ids.length;
    },
    onSuccess: (n) => { toast.success(`${n} document(s) deleted`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return { bulkCancel, bulkDelete };
}

// Realtime subscription for documents
export function useDocumentsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel('documents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => {
        qc.invalidateQueries({ queryKey: ['documents'] });
        qc.invalidateQueries({ queryKey: ['document'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'document_items' }, () => {
        qc.invalidateQueries({ queryKey: ['document'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        qc.invalidateQueries({ queryKey: ['document_payments'] });
        qc.invalidateQueries({ queryKey: ['document'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);
}
