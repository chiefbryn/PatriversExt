import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Trash2, ImageIcon, AlertTriangle, Camera, History } from 'lucide-react';
import MyDocuments from '@/pages/MyDocuments';
import { AppShellSkeleton, InlineSkeleton } from '@/components/LoadingSkeletons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const SECTIONS = ['Company profile', 'Logo & branding', 'Receipt settings', 'System preferences', 'My Documents', 'Data reset', 'About system'];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState('Company profile');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [snapshotting, setSnapshotting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const { data: settings, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Creates the settings record on first save so the form always has somewhere to write to
  const ensureSettingsId = async (): Promise<string> => {
    if (settings?.id) return settings.id;
    const { data: existing } = await supabase.from('company_settings').select('id').limit(1).maybeSingle();
    if (existing?.id) return existing.id;
    const { data: created, error } = await supabase
      .from('company_settings')
      .insert({ company_name: 'Patrivers Pharmacy' } as any)
      .select('id')
      .single();
    if (error) throw error;
    return created.id;
  };

  const [form, setForm] = useState<Record<string, any>>({});

  // Sync form when settings load
  const s = { ...settings, ...form };

  const set = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  const handleResetSystem = async () => {
    setResetting(true);
    try {
      const { data, error } = await supabase.rpc('reset_system_data' as any);
      if (error) throw error;
      const counts = (data ?? {}) as Record<string, number>;
      const total = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);
      toast.success(`System reset complete — ${total} record(s) cleared`);
      setResetConfirm('');
      queryClient.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || 'Reset failed');
    }
    setResetting(false);
  };

  const handleSnapshotNow = async () => {
    setSnapshotting(true);
    try {
      const { data, error } = await supabase.rpc('take_stock_snapshot' as any, { p_source: 'manual' });
      if (error) throw error;
      const rows = (data as any)?.rows ?? 0;
      toast.success(`Snapshot captured for today — ${rows} product(s)`);
    } catch (err: any) {
      toast.error(err.message || 'Snapshot failed');
    }
    setSnapshotting(false);
  };

  const handleBackfillSnapshots = async () => {
    setBackfilling(true);
    try {
      const { data, error } = await supabase.rpc('backfill_stock_snapshots' as any);
      if (error) throw error;
      const days = (data as any)?.days_processed ?? 0;
      const rows = (data as any)?.total_rows ?? 0;
      toast.success(`Backfilled ${days} day(s), ${rows} snapshot row(s)`);
    } catch (err: any) {
      toast.error(err.message || 'Backfill failed');
    }
    setBackfilling(false);
  };

  const handleSave = async () => {
    if (Object.keys(form).length === 0) { toast.info('No changes to save'); return; }
    setSaving(true);
    try {
      const id = await ensureSettingsId();
      const { error } = await supabase.from('company_settings').update(form as any).eq('id', id);
      if (error) throw error;
      toast.success('Settings saved');
      setForm({});
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    }
    setSaving(false);
  };

  const handleUpload = async (file: File, field: 'logo_url' | 'favicon_url') => {
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) { toast.error('File must be under 2MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Only image files allowed'); return; }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${field === 'logo_url' ? 'logo' : 'favicon'}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('company-assets')
        .getPublicUrl(path);

      const id = await ensureSettingsId();
      const { error: updateError } = await supabase
        .from('company_settings')
        .update({ [field]: publicUrl } as any)
        .eq('id', id);
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      toast.success(`${field === 'logo_url' ? 'Logo' : 'Favicon'} uploaded successfully`);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    }
    setUploading(false);
  };

  const handleRemoveImage = async (field: 'logo_url' | 'favicon_url') => {
    if (!settings?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({ [field]: null } as any)
        .eq('id', settings.id);

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      toast.success('Image removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove');
    }
    setSaving(false);
  };

  if (isLoading) {
    return <AppShellSkeleton />;
  }

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-0px)]">
      <div className="lg:w-52 border-b lg:border-b-0 lg:border-r bg-card p-2 lg:p-3 flex lg:flex-col gap-1 lg:gap-0.5 overflow-x-auto lg:overflow-y-auto shrink-0">
        {SECTIONS.map(sec => (
          <button key={sec} onClick={() => setActive(sec)}
            className={cn('whitespace-nowrap lg:w-full text-left px-3 py-2 rounded text-sm transition-colors',
              active === sec ? 'bg-primary text-primary-foreground font-medium' : 'text-foreground hover:bg-secondary')}>
            {sec}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto min-w-0">
        <h1 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">{active}</h1>

        {active === 'Company profile' && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label>Company name</Label><Input value={s.company_name || ''} onChange={e => set('company_name', e.target.value)} /></div>
                <div><Label>Tagline</Label><Input value={s.tagline || ''} onChange={e => set('tagline', e.target.value)} /></div>
                <div><Label>Registration number</Label><Input value={s.reg_number || ''} onChange={e => set('reg_number', e.target.value)} /></div>
                <div><Label>Tax/VAT number</Label><Input value={s.tax_number || ''} onChange={e => set('tax_number', e.target.value)} /></div>
                <div><Label>Email</Label><Input type="email" value={s.email || ''} onChange={e => set('email', e.target.value)} /></div>
                <div><Label>Phone (primary)</Label><Input value={s.phone_primary || ''} onChange={e => set('phone_primary', e.target.value)} /></div>
                <div><Label>Phone (secondary)</Label><Input value={s.phone_secondary || ''} onChange={e => set('phone_secondary', e.target.value)} /></div>
                <div><Label>Website</Label><Input value={s.website || ''} onChange={e => set('website', e.target.value)} /></div>
                <div><Label>Street address</Label><Input value={s.address || ''} onChange={e => set('address', e.target.value)} /></div>
                <div><Label>City</Label><Input value={s.city || ''} onChange={e => set('city', e.target.value)} /></div>
                <div><Label>Region</Label><Input value={s.region || ''} onChange={e => set('region', e.target.value)} /></div>
                <div><Label>Country</Label><Input value={s.country || ''} onChange={e => set('country', e.target.value)} /></div>
              </div>
              <Button onClick={handleSave} disabled={saving}>{saving ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : 'Save changes'}</Button>
            </CardContent>
          </Card>
        )}

        {active === 'Logo & branding' && (
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* Logo upload */}
              <div>
                <Label className="mb-2 block">Company Logo</Label>
                <div className="flex items-start gap-4">
                  <div className="w-28 h-28 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
                    {s.logo_url ? (
                      <img src={s.logo_url} alt="Company logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <ImageIcon className="w-10 h-10 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'logo_url'); e.target.value = ''; }} />
                    <Button variant="outline" size="sm" disabled={uploading} onClick={() => logoInputRef.current?.click()}>
                      {!uploading && <Upload className="w-4 h-4 mr-1.5" />} {uploading ? <InlineSkeleton className="h-4 w-20" /> : 'Upload Logo'}
                    </Button>
                    {s.logo_url && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleRemoveImage('logo_url')}>
                        <Trash2 className="w-4 h-4 mr-1.5" /> Remove
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">PNG, JPG or SVG. Max 2MB. Recommended 200×200px.</p>
                  </div>
                </div>
              </div>

              {/* Favicon upload */}
              <div>
                <Label className="mb-2 block">Favicon</Label>
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-muted/30 overflow-hidden shrink-0">
                    {s.favicon_url ? (
                      <img src={s.favicon_url} alt="Favicon" className="w-full h-full object-contain p-1" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <input ref={faviconInputRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, 'favicon_url'); e.target.value = ''; }} />
                    <Button variant="outline" size="sm" disabled={uploading} onClick={() => faviconInputRef.current?.click()}>
                      {!uploading && <Upload className="w-4 h-4 mr-1.5" />} {uploading ? <InlineSkeleton className="h-4 w-20" /> : 'Upload Favicon'}
                    </Button>
                    {s.favicon_url && (
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleRemoveImage('favicon_url')}>
                        <Trash2 className="w-4 h-4 mr-1.5" /> Remove
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">PNG or ICO. Max 2MB. 32×32px recommended.</p>
                  </div>
                </div>
              </div>

              {/* Brand colors */}
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label>Primary brand color</Label><Input type="color" value={s.brand_primary_color || '#1E3A5F'} onChange={e => set('brand_primary_color', e.target.value)} className="h-10" /></div>
                <div><Label>Secondary brand color</Label><Input type="color" value={s.brand_secondary_color || '#22C55E'} onChange={e => set('brand_secondary_color', e.target.value)} className="h-10" /></div>
              </div>
              <Button onClick={handleSave} disabled={saving}>{saving ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : 'Save changes'}</Button>
            </CardContent>
          </Card>
        )}

        {active === 'Receipt settings' && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div><Label>Receipt title</Label><Input value={s.receipt_title || ''} onChange={e => set('receipt_title', e.target.value)} /></div>
                <div><Label>Receipt footer</Label><Input value={s.receipt_footer || ''} onChange={e => set('receipt_footer', e.target.value)} /></div>
                <div>
                  <Label>Paper size</Label>
                  <Select value={s.receipt_paper_size || '80mm'} onValueChange={v => set('receipt_paper_size', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58mm">58mm</SelectItem>
                      <SelectItem value="80mm">80mm</SelectItem>
                      <SelectItem value="A4">A4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Receipt copies</Label><Input type="number" min={1} max={5} value={s.receipt_copies || 1} onChange={e => set('receipt_copies', parseInt(e.target.value) || 1)} /></div>
                <div><Label>Header color</Label><Input type="color" value={s.receipt_header_color || '#1E3A5F'} onChange={e => set('receipt_header_color', e.target.value)} className="h-10" /></div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><Label>Show logo on receipt</Label><Switch checked={s.show_logo_on_receipt ?? true} onCheckedChange={v => set('show_logo_on_receipt', v)} /></div>
                <div className="flex items-center justify-between"><Label>Show tagline on receipt</Label><Switch checked={s.show_tagline_on_receipt ?? false} onCheckedChange={v => set('show_tagline_on_receipt', v)} /></div>
                <div className="flex items-center justify-between"><Label>Show pharmacist on receipt</Label><Switch checked={s.show_pharmacist_on_receipt ?? false} onCheckedChange={v => set('show_pharmacist_on_receipt', v)} /></div>
                <div className="flex items-center justify-between"><Label>Auto-print</Label><Switch checked={s.auto_print ?? true} onCheckedChange={v => set('auto_print', v)} /></div>
              </div>
              <Button onClick={handleSave} disabled={saving}>{saving ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : 'Save changes'}</Button>
            </CardContent>
          </Card>
        )}

        {active === 'System preferences' && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Currency</Label>
                  <Select value={s.currency || 'GH₵'} onValueChange={v => set('currency', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GH₵">GH₵ (Ghana Cedi)</SelectItem>
                      <SelectItem value="$">$ (US Dollar)</SelectItem>
                      <SelectItem value="€">€ (Euro)</SelectItem>
                      <SelectItem value="£">£ (Pound)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date format</Label>
                  <Select value={s.date_format || 'DD/MM/YYYY'} onValueChange={v => set('date_format', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Default UOM</Label>
                  <Select value={s.default_uom || 'Tablet'} onValueChange={v => set('default_uom', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Tablet', 'Capsule', 'Bottle', 'Sachet', 'Tube', 'Pack', 'Vial', 'Strip'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Low stock threshold</Label><Input type="number" min={1} value={s.low_stock_threshold || 10} onChange={e => set('low_stock_threshold', parseInt(e.target.value) || 10)} /></div>
                <div><Label>Session timeout (minutes)</Label><Input type="number" min={5} value={s.session_timeout || 30} onChange={e => set('session_timeout', parseInt(e.target.value) || 30)} /></div>
              </div>
              <Button onClick={handleSave} disabled={saving}>{saving ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : 'Save changes'}</Button>
            </CardContent>
          </Card>
        )}

        {active === 'My Documents' && (
          <div className="-m-4 md:-m-6">
            <MyDocuments />
          </div>
        )}

        {active === 'Data reset' && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-md bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-destructive">Danger zone — System reset</p>
                  <p className="text-muted-foreground">
                    Use this to hand the system over to the client with a clean slate. This will permanently delete:
                  </p>
                  <ul className="list-disc pl-5 text-muted-foreground text-xs space-y-0.5 mt-1">
                    <li>All sales, receipts, payments and parked sales</li>
                    <li>All documents (purchases, GRN, transfers, etc.) and their items</li>
                    <li>All stock movements, prescriptions and requisitions</li>
                    <li>All login history, activity logs and audit logs</li>
                    <li>Stock-on-hand records and stock batches</li>
                    <li>Product quantities, batch numbers, expiry dates and supplier names cleared</li>
                    <li>Document type counters reset to 1</li>
                  </ul>
                  <p className="text-muted-foreground mt-2">
                    <strong>Kept:</strong> product catalogue (names, categories, pricing), price list, users, roles, payment types, document types and company settings.
                  </p>
                </div>
              </div>

              {/* Stock snapshot tools */}
              <div className="rounded-md border p-4 space-y-3">
                <div className="space-y-1">
                  <p className="font-semibold">Stock history snapshots</p>
                  <p className="text-xs text-muted-foreground">
                    Daily stock snapshots are captured automatically when users sign in and sign out. Use these tools to capture an extra snapshot now or rebuild full history for the past.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleSnapshotNow} disabled={snapshotting} className="gap-2">
                    <Camera className="w-4 h-4" />
                    {snapshotting ? <InlineSkeleton className="h-4 w-20 bg-primary-foreground/30" /> : 'Snapshot today'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleBackfillSnapshots} disabled={backfilling} className="gap-2">
                    <History className="w-4 h-4" />
                    {backfilling ? <InlineSkeleton className="h-4 w-24" /> : 'Backfill all history'}
                  </Button>
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2">
                    <Trash2 className="w-4 h-4" />
                    Reset system data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset all transactional data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. To confirm, type <strong>RESET</strong> below.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Input
                    value={resetConfirm}
                    onChange={e => setResetConfirm(e.target.value)}
                    placeholder="Type RESET to confirm"
                    autoFocus
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setResetConfirm('')}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={resetConfirm !== 'RESET' || resetting}
                      onClick={handleResetSystem}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {resetting ? <InlineSkeleton className="h-4 w-24 bg-destructive-foreground/30" /> : 'Yes, reset everything'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}

        {active === 'About system' && (
          <Card>
            <CardContent className="pt-6 space-y-3 text-sm">
              <p><strong>System name:</strong> {settings?.company_name || 'Patrivers Pharmacy'}</p>
              <p><strong>Version:</strong> 1.0.0</p>
              <p><strong>Built by:</strong> Chief Alltechs Ventures</p>
              <p><strong>Last updated:</strong> {new Date().toLocaleDateString('en-GB')}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
