import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ShoppingCart, Clock, FileText, Printer, Package, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useProducts, useProductsRealtime, type Product } from '@/hooks/useProducts';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RequestRestockDialog, LOW_STOCK_THRESHOLD } from '@/components/RequestRestockDialog';
import { printHTML } from '@/lib/printReport';
import { enqueueOffline, getDeviceKey, getOfflineAuthorization, getOfflineMeta, reduceCachedStock, removeQueueItem, setOfflineMeta, updateQueueItem, getQueueItems } from '@/lib/offlineDb';
import { useConnectivity } from '@/hooks/useConnectivity';

interface ReceiptData {
  invoiceNumber: string;
  date: string;
  customerName: string;
  paymentMethod: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  amountTendered: number;
  changeDue: number;
  cashier: string;
  saleType: 'retail' | 'wholesale';
}

interface CartItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  discount: number;
  maxQty: number;
}

export default function POS() {
  useProductsRealtime();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const { online, refresh: refreshSyncStatus } = useConnectivity();
  const { data: products = [] } = useProducts();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [saleType, setSaleType] = useState<'retail' | 'wholesale'>('retail');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [requestProduct, setRequestProduct] = useState<Product | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountTendered, setAmountTendered] = useState<number | ''>('');
  const [charging, setCharging] = useState(false);
  const saleClientIdRef = useRef<string | null>(null);
  const [ceoUserId, setCeoUserId] = useState<string>('');
  const [creditNotes, setCreditNotes] = useState('');
  const [parkedOpen, setParkedOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [hasPrinted, setHasPrinted] = useState(false);
  const [proformaLoading, setProformaLoading] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Fetch company settings for receipt
  const { data: companySettings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      if (!navigator.onLine) return getOfflineMeta<any>('company_settings');
      const { data } = await supabase.from('company_settings').select('*').limit(1).single();
      if (data) await setOfflineMeta('company_settings', data);
      return data;
    },
  });

  // Fetch user profile for cashier name
  const { data: userProfile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      if (!navigator.onLine) return { full_name: (await getOfflineAuthorization(user.id))?.fullName || 'Staff' };
      const { data } = await supabase.from('profiles').select('full_name').eq('user_id', user.id).single();
      return data;
    },
    enabled: !!user,
  });

  // Live payment types
  const { data: paymentTypes = [] } = useQuery({
    queryKey: ['payment-types-active'],
    queryFn: async () => {
      if (!navigator.onLine) return (await getOfflineMeta<any[]>('payment_types')) || [];
      const { data } = await supabase.from('payment_types').select('*').eq('is_active', true).order('name');
      const rows = data || [];
      await setOfflineMeta('payment_types', rows);
      return rows;
    },
  });

  // CEO users for credit option
  const { data: ceoUsers = [] } = useQuery({
    queryKey: ['ceo-users'],
    queryFn: async () => {
      if (!online) return [];
      const { data } = await (supabase.rpc as any)('list_ceo_users');
      return (data || []) as { user_id: string; full_name: string }[];
    },
  });

  // Parked sales
  const { data: parkedSales = [] } = useQuery({
    queryKey: ['parked-sales'],
    queryFn: async () => {
      if (!online) return [];
      const { data } = await supabase.from('parked_sales').select('*').order('created_at', { ascending: false });
      return data || [];
    },
  });


  useEffect(() => {
    const channel = supabase.channel('pos-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parked_sales' }, () => {
        queryClient.invalidateQueries({ queryKey: ['parked-sales'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Derive categories from live products
  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category))].sort();
    return ['All', ...cats];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let list = products.filter(p => p.qty > 0 && (p as any).status !== 'inactive');
    if (activeCategory !== 'All') list = list.filter(p => p.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.batch_number?.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCategory, search]);

  const priceFor = (p: Product) => {
    const wholesale = Number((p as any).wholesale_price || 0);
    return saleType === 'wholesale' && wholesale > 0 ? wholesale : Number(p.sales_price);
  };

  const addToCart = (p: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === p.id);
      if (existing) {
        if (existing.qty >= p.qty) return prev;
        return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id: p.id, name: p.name, qty: 1, price: priceFor(p), discount: 0, maxQty: p.qty }];
    });
    setSearch('');
  };

  // Switching sale type re-prices anything already in the cart
  useEffect(() => {
    setCart(prev => prev.map(i => {
      const p = products.find(pr => pr.id === i.id);
      return p ? { ...i, price: priceFor(p) } : i;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleType]);

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty - i.discount, 0);
  const totalDiscount = cart.reduce((sum, i) => sum + i.discount, 0);
  const grandTotal = subtotal;
  const amountTenderedNum = typeof amountTendered === 'number' ? amountTendered : 0;
  const changeDue = Math.max(amountTenderedNum - grandTotal, 0);

  const updateQty = (id: string, qty: number) => {
    if (qty < 1) return;
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.min(qty, i.maxQty) } : i));
  };
  const removeItem = (id: string) => setCart(prev => prev.filter(i => i.id !== id));

  // Print receipt (uses hidden iframe — bypasses popup blockers)
  const handlePrint = () => {
    if (!receiptRef.current) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title> </title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { background:#fff; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; width: 80mm; padding: 4mm; color:#000; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        img { display:block; margin:0 auto 6px; max-height:60px; max-width:100%; object-fit:contain; }
        p { margin: 0; }
        /* Tailwind utility shims so the print matches the on-screen receipt exactly */
        .flex { display:flex; }
        .justify-between { justify-content:space-between; }
        .text-center { text-align:center; }
        .text-left { text-align:left; }
        .text-right { text-align:right; }
        .font-bold { font-weight:700; }
        .font-mono { font-family: 'Helvetica Neue', Arial, sans-serif; }
        .leading-relaxed { line-height:1.5; }
        .mb-3 { margin-bottom:8px; }
        .my-2 { margin-top:6px; margin-bottom:6px; }
        .mt-2 { margin-top:6px; }
        .py-0\\.5 { padding-top:2px; padding-bottom:2px; }
        .w-full { width:100%; }
        .max-w-\\[100px\\] { max-width:38mm; }
        .truncate { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .text-\\[10px\\] { font-size:10px; }
        .text-\\[11px\\] { font-size:11px; }
        .text-xs { font-size:11px; }
        .text-sm { font-size:13px; }
        .space-y-0\\.5 > * + * { margin-top:2px; }
        .border-t { border-top:1px solid #000; }
        .border-b { border-bottom:1px solid #000; }
        .border-dashed { border-style:dashed; }
        .border-black { border-color:#000; }
        table { width:100%; border-collapse:collapse; }
        th, td { padding:2px 0; vertical-align:top; }
      </style></head><body>
      ${receiptRef.current.innerHTML}
      </body></html>`;
    printHTML(html);
    setHasPrinted(true);
  };

  // Charge / complete sale
  const handleCharge = async () => {
    if (!user) return;
    const isCeoCredit = paymentMethod === 'CEO Credit';

    if (isCeoCredit && !ceoUserId) {
      toast.error('Select the CEO who is taking on credit');
      return;
    }

    setCharging(true);
    // Unique id per sale attempt so retries never create duplicates
    if (!saleClientIdRef.current) saleClientIdRef.current = crypto.randomUUID();
    try {
      const saleItems = [...cart];
      const items = cart.map(i => ({
        product_id: i.id,
        unit_price: i.price,
        quantity: i.qty,
        discount: i.discount,
      }));

      const ceo = ceoUsers.find(c => c.user_id === ceoUserId);
      const effectiveCustomer = isCeoCredit
        ? `CEO Credit - ${ceo?.full_name || 'CEO'}`
        : (customerName || 'Walk-in');
      const effectiveTendered = isCeoCredit ? 0 : amountTenderedNum;
      const clientId = saleClientIdRef.current;
      const authorization = await getOfflineAuthorization(user.id);
      if (!authorization?.outletId || !clientId) throw new Error('This device has no offline outlet authorization');
      const createdAt = new Date().toISOString();
      const deviceKey = authorization.deviceKey || getDeviceKey(user.id);
      const payload = {
        p_cashier_id: user.id,
        p_customer_name: effectiveCustomer,
        p_payment_method: paymentMethod,
        p_discount: 0,
        p_amount_tendered: effectiveTendered,
        p_items: items as any,
        p_client_id: clientId,
        p_outlet_id: authorization.outletId,
        p_device_id: deviceKey,
        p_created_at: createdAt,
        p_notes: isCeoCredit ? `CEO credit${creditNotes ? ': ' + creditNotes : ''}` : undefined,
        p_sale_type: saleType,
      };
      let result: any = { invoice_number: `OFF-${clientId.slice(0, 8).toUpperCase()}`, change_due: Math.max(effectiveTendered - grandTotal, 0), offline: true };
      if (!online) {
        if (isCeoCredit) throw new Error('CEO credit requires an internet connection');
        await enqueueOffline({ id: clientId, kind: 'sale', userId: user.id, outletId: authorization.outletId, deviceKey, createdAt, payload });
        await reduceCachedStock(items);
        await refreshSyncStatus();
      } else {
        await enqueueOffline({ id: clientId, kind: 'sale', userId: user.id, outletId: authorization.outletId, deviceKey, createdAt, payload });
        const response = await supabase.rpc('process_sale', payload as any);
        if (response.error) {
          const message = response.error.message || 'Sale failed';
          const transient = /fetch|network|timeout|timed out|502|503|504/i.test(message);
          if (!transient) {
            await removeQueueItem(clientId);
            throw response.error;
          }
          const queued = (await getQueueItems()).find(item => item.id === clientId);
          if (queued) await updateQueueItem({ ...queued, status: 'failed', attempts: queued.attempts + 1, lastError: message });
          await reduceCachedStock(items);
        } else {
          await removeQueueItem(clientId);
          result = response.data as any;
        }
        await refreshSyncStatus();
      }
      saleClientIdRef.current = null;
      const saleSubtotal = saleItems.reduce((sum, i) => sum + i.price * i.qty - i.discount, 0);
      const saleDiscount = saleItems.reduce((sum, i) => sum + i.discount, 0);

      // Record CEO credit ledger entry
      if (online && isCeoCredit && ceo) {
        const { error: credErr } = await supabase.from('ceo_credits').insert({
          sale_id: result.sale_id,
          ceo_user_id: ceo.user_id,
          ceo_name: ceo.full_name,
          amount: saleSubtotal,
          amount_paid: 0,
          balance: saleSubtotal,
          notes: creditNotes || null,
          recorded_by: user.id,
          recorded_by_name: userProfile?.full_name || null,
        });
        if (credErr) {
          toast.error('Sale completed but credit log failed: ' + credErr.message);
        } else {
          toast.success(`Credited GH₵ ${saleSubtotal.toFixed(2)} to ${ceo.full_name}`);
        }
      }

      setReceiptData({
        invoiceNumber: result.invoice_number,
        date: new Date().toLocaleString('en-GB'),
        customerName: effectiveCustomer,
        paymentMethod,
        items: saleItems,
        subtotal: saleSubtotal,
        discount: saleDiscount,
        total: saleSubtotal,
        amountTendered: effectiveTendered,
        changeDue: Number(result.change_due || 0),
        cashier: userProfile?.full_name || 'Staff',
        saleType,
      });

      setCart([]);
      setCustomerName('');
      
      setChargeOpen(false);
      setAmountTendered('');
      setCeoUserId('');
      setCreditNotes('');
      setPaymentMethod('Cash');
      setHasPrinted(false);
      setReceiptOpen(true);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['ceo-credits'] });
      if (!isCeoCredit) toast.success(result.offline ? 'Sale saved on this device. It will sync automatically.' : `Sale completed: ${result.invoice_number}`);
    } catch (err: any) {
      toast.error(err.message || 'Sale failed');
    }
    setCharging(false);
  };

  // Hold / park sale
  const handleHoldSale = async () => {
    if (!user || cart.length === 0) return;
    try {
      const ref = `PARK-${Date.now().toString(36).toUpperCase()}`;
      const { error } = await supabase.from('parked_sales').insert({
        cashier_id: user.id,
        reference: ref,
        customer_name: customerName || 'Walk-in',
        total: grandTotal,
        cart_items: cart as any,
      });
      if (error) throw error;
      toast.success(`Sale parked: ${ref}`);
      setCart([]);
      setCustomerName('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to park sale');
    }
  };

  // Resume parked sale
  const handleResume = async (id: string, items: any) => {
    setCart(items);
    try {
      await supabase.from('parked_sales').delete().eq('id', id);
      queryClient.invalidateQueries({ queryKey: ['parked-sales'] });
      toast.success('Sale resumed');
      setParkedOpen(false);
    } catch {
      toast.error('Failed to resume');
    }
  };

  // Generate proforma from current cart
  const handleProforma = async () => {
    if (!user || cart.length === 0) return;
    setProformaLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(
        `${supabaseUrl}/functions/v1/manage-documents?action=create_draft`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            category: 'Proforma',
            sub_type: 'Proforma Invoice',
            customer_name: customerName || 'Walk-in',
            items: cart.map(i => ({
              product_id: i.id,
              quantity: i.qty,
              unit_price: i.price,
            })),
          }),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Failed to create proforma');
      toast.success(`Proforma created: ${result.doc_number || 'Draft'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create proforma');
    }
    setProformaLoading(false);
  };


  const [showCart, setShowCart] = useState(false);

  return (
    <div className="h-[calc(100vh-theme(spacing.0))] lg:h-screen flex flex-col">
      {/* Top bar */}
      <div className="h-12 border-b bg-card px-2 sm:px-4 flex items-center justify-between shrink-0 no-print">
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full">
            <User className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">{userProfile?.full_name || 'Cashier'}</span>
          </div>
          <span className="hidden md:inline text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-GB')} &middot; {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <div className="flex items-center border rounded-md overflow-hidden">
            {(['retail', 'wholesale'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setSaleType(mode)}
                className={cn(
                  'px-3 py-1 text-xs font-medium capitalize transition-colors',
                  saleType === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Mobile cart toggle */}
          <Button variant={showCart ? 'default' : 'outline'} size="sm" className="lg:hidden gap-1.5 text-xs" onClick={() => setShowCart(!showCart)}>
            <ShoppingCart className="w-3.5 h-3.5" />
            {cart.length > 0 && <span className="bg-destructive text-destructive-foreground rounded-full px-1.5 text-[10px]">{cart.length}</span>}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setParkedOpen(true)}>
            <Clock className="w-3.5 h-3.5" />Parked: {parkedSales.length}
          </Button>
          
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" disabled={!online || cart.length === 0 || proformaLoading} onClick={handleProforma} title={online ? 'Create proforma' : 'Internet connection required'}>
            <FileText className="w-3.5 h-3.5" />{proformaLoading ? 'Creating...' : 'Proforma'}
          </Button>
          
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left - Products */}
        <div className={`${showCart ? 'hidden lg:flex' : 'flex'} lg:w-[60%] flex-1 lg:flex-none border-r flex-col overflow-hidden`}>
          <div className="p-4 space-y-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by product name or batch..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-0">
            {!search.trim() ? (
              <div className="text-sm text-muted-foreground py-16 text-center">
                <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p>Type a product name or batch number to search</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-16 text-center">
                <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p>No products found.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredProducts.map(p => {
                  const isLow = p.qty < LOW_STOCK_THRESHOLD;
                  return (
                    <div key={p.id} className="flex items-center gap-3 border rounded-lg p-3 hover:border-primary hover:shadow-sm transition-all bg-card group">
                      <button onClick={() => addToCart(p)} className="flex-1 text-left min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">{p.category} · {p.uom}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-semibold text-primary">GH₵ {priceFor(p).toFixed(2)}</span>
                            <span className={`block text-[10px] font-medium ${isLow ? 'text-destructive' : 'text-muted-foreground'}`}>Qty: {p.qty}</span>
                          </div>
                        </div>
                      </button>
                      {isLow && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 bg-card shrink-0"
                          onClick={(e) => { e.stopPropagation(); setRequestProduct(p); }}
                        >
                          Request
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right - Cart */}
        <div className={`${showCart ? 'flex' : 'hidden lg:flex'} lg:w-[40%] flex-1 lg:flex-none flex-col bg-card`}>
          <div className="p-4 border-b shrink-0">
            <Input placeholder="Customer name (default: Walk-in)" className="text-sm" value={customerName} onChange={e => setCustomerName(e.target.value)} />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="text-sm text-muted-foreground py-16 text-center">
                <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p>Cart is empty</p>
                <p className="text-xs mt-1">Click products to add them here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center gap-2 text-sm p-2 rounded bg-secondary/50">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">GH₵ {item.price.toFixed(2)}</p>
                    </div>
                    <Input type="number" min={1} max={item.maxQty} value={item.qty}
                      onChange={e => updateQty(item.id, parseInt(e.target.value) || 1)}
                      className="w-14 text-center text-xs h-8" />
                    <span className="w-16 text-right font-medium">GH₵ {(item.price * item.qty).toFixed(2)}</span>
                    <button onClick={() => removeItem(item.id)} className="text-destructive hover:text-destructive/80 text-xs px-1">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t p-4 space-y-3 shrink-0">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>GH₵ {subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>GH₵ {totalDiscount.toFixed(2)}</span></div>
              <Separator />
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-accent">GH₵ {grandTotal.toFixed(2)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" disabled={cart.length === 0} onClick={() => { setAmountTendered(grandTotal); setChargeOpen(true); }}>Charge</Button>
              <Button variant="outline" disabled={cart.length === 0} onClick={handleHoldSale}>Hold sale</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCart([]); setCustomerName(''); }}>New sale</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Charge Dialog */}
      <Dialog open={chargeOpen} onOpenChange={setChargeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Complete Sale</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-accent">GH₵ {grandTotal.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">{cart.length} item{cart.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {paymentTypes.map(pt => <SelectItem key={pt.id} value={pt.name}>{pt.name}</SelectItem>)}
                  {paymentTypes.length === 0 && <SelectItem value="Cash">Cash</SelectItem>}
                  {online && <SelectItem value="CEO Credit">CEO Credit (Pay Later)</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'CEO Credit' ? (
              <>
                <div className="space-y-1.5">
                  <Label>CEO taking on credit *</Label>
                  <Select value={ceoUserId} onValueChange={setCeoUserId}>
                    <SelectTrigger><SelectValue placeholder="Select CEO" /></SelectTrigger>
                    <SelectContent>
                      {ceoUsers.length === 0 && (
                        <SelectItem value="__none" disabled>No CEO user found</SelectItem>
                      )}
                      {ceoUsers.map(c => (
                        <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Credit can only be issued to a CEO — no other staff or customers.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Note (optional)</Label>
                  <Input placeholder="Reason / reference" value={creditNotes} onChange={e => setCreditNotes(e.target.value)} />
                </div>
                <div className="text-center p-2 rounded bg-orange-500/10 border border-orange-500/30">
                  <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                  <p className="text-xl font-bold text-orange-600">GH₵ {grandTotal.toFixed(2)}</p>
                </div>
                <Button
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
                  disabled={charging || !ceoUserId}
                  onClick={handleCharge}
                >
                  {charging ? <Skeleton className="h-4 w-32 bg-accent-foreground/30" /> : 'Confirm & Credit to CEO'}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Amount Tendered (GH₵)</Label>
                  <Input type="number" min={0} step="0.01" value={amountTendered} onChange={e => setAmountTendered(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)} />
                </div>
                {amountTenderedNum >= grandTotal && (
                  <div className="text-center p-2 rounded bg-accent/10">
                    <p className="text-sm text-muted-foreground">Change Due</p>
                    <p className="text-xl font-bold text-accent">GH₵ {changeDue.toFixed(2)}</p>
                  </div>
                )}
                <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold" disabled={charging || amountTenderedNum < grandTotal} onClick={handleCharge}>
                  {charging ? <Skeleton className="h-4 w-28 bg-accent-foreground/30" /> : 'Confirm & Complete'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Parked Sales Dialog */}
      <Dialog open={parkedOpen} onOpenChange={setParkedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Parked Sales</DialogTitle></DialogHeader>
          {parkedSales.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No parked sales.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {parkedSales.map(ps => (
                <div key={ps.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{ps.reference}</p>
                    <p className="text-xs text-muted-foreground">{ps.customer_name} · GH₵ {Number(ps.total).toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(ps.created_at).toLocaleString('en-GB')}</p>
                  </div>
                  <Button size="sm" onClick={() => handleResume(ps.id, ps.cart_items)}>Resume</Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt Preview Dialog */}
      <Dialog open={receiptOpen}>
        <DialogContent className="max-w-sm" hideClose onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>Sale Receipt {!hasPrinted && role !== 'admin' && <span className="text-xs font-normal text-destructive">(Print required)</span>}</DialogTitle></DialogHeader>
          {receiptData && (
            <>
              <div ref={receiptRef} className="bg-white text-black p-4 text-xs font-mono leading-relaxed">
                <div className="text-center mb-3">
                  {(companySettings?.show_logo_on_receipt ?? true) && companySettings?.logo_url && (
                    <img
                      src={companySettings.logo_url}
                      alt="Company logo"
                      crossOrigin="anonymous"
                      style={{ maxHeight: '60px', maxWidth: '100%', margin: '0 auto 6px', display: 'block', objectFit: 'contain' }}
                    />
                  )}
                  <p className="text-sm font-bold">{companySettings?.company_name || 'Patrivers Pharmacy'}</p>
                  {(companySettings?.show_tagline_on_receipt ?? false) && companySettings?.tagline && <p className="text-[10px]">{companySettings.tagline}</p>}
                  {companySettings?.address && <p className="text-[10px]">{companySettings.address}</p>}
                  {companySettings?.city && <p className="text-[10px]">{companySettings.city}{companySettings?.region ? `, ${companySettings.region}` : ''}</p>}
                  {companySettings?.phone_primary && <p className="text-[10px]">Tel: {companySettings.phone_primary}</p>}
                </div>
                <div className="border-t border-dashed border-black my-2" />
                <p className="text-center font-bold text-[11px]">{companySettings?.receipt_title || 'SALES RECEIPT'}</p>
                <div className="border-t border-dashed border-black my-2" />
                <div className="space-y-0.5">
                  <div className="flex justify-between"><span>Invoice:</span><span>{receiptData.invoiceNumber}</span></div>
                  <div className="flex justify-between"><span>Date:</span><span>{receiptData.date}</span></div>
                  <div className="flex justify-between"><span>Customer:</span><span>{receiptData.customerName}</span></div>
                  <div className="flex justify-between"><span>Cashier:</span><span>{receiptData.cashier}</span></div>
                  <div className="flex justify-between"><span>Sale type:</span><span className="capitalize">{receiptData.saleType}</span></div>
                </div>
                <div className="border-t border-dashed border-black my-2" />
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="text-left py-0.5">Item</th>
                      <th className="text-right py-0.5">Qty</th>
                      <th className="text-right py-0.5">Price</th>
                      <th className="text-right py-0.5">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptData.items.map((item, i) => (
                      <tr key={i}>
                        <td className="py-0.5 max-w-[100px] truncate">{item.name}</td>
                        <td className="text-right py-0.5">{item.qty}</td>
                        <td className="text-right py-0.5">{item.price.toFixed(2)}</td>
                        <td className="text-right py-0.5">{(item.price * item.qty).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-dashed border-black my-2" />
                <div className="space-y-0.5">
                  <div className="flex justify-between"><span>Subtotal:</span><span>GH₵ {receiptData.subtotal.toFixed(2)}</span></div>
                  {receiptData.discount > 0 && <div className="flex justify-between"><span>Discount:</span><span>GH₵ {receiptData.discount.toFixed(2)}</span></div>}
                  <div className="flex justify-between font-bold text-[11px]"><span>TOTAL:</span><span>GH₵ {receiptData.total.toFixed(2)}</span></div>
                </div>
                <div className="border-t border-dashed border-black my-2" />
                <div className="space-y-0.5">
                  <div className="flex justify-between"><span>Payment:</span><span>{receiptData.paymentMethod}</span></div>
                  <div className="flex justify-between"><span>Tendered:</span><span>GH₵ {receiptData.amountTendered.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold"><span>Change:</span><span>GH₵ {receiptData.changeDue.toFixed(2)}</span></div>
                </div>
                <div className="border-t border-dashed border-black my-2" />
                <p className="text-center text-[10px] mt-2">{companySettings?.receipt_footer || 'Thank you for your patronage!'}</p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  className="flex-1 gap-2"
                  onClick={() => {
                    handlePrint();
                    setReceiptOpen(false);
                  }}
                >
                  <Printer className="w-4 h-4" /> Print & Done
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>



      <RequestRestockDialog
        product={requestProduct ? { name: requestProduct.name, qty: requestProduct.qty, uom: requestProduct.uom } : null}
        onClose={() => setRequestProduct(null)}
      />
    </div>
  );
}
