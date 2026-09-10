import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  /** Button label. */
  label: string;
  /** Dialog title. */
  title: string;
  /** Plain-English description of exactly what gets deleted. */
  description: string;
  /** RPC name + params builder. */
  rpc: string;
  params: Record<string, any>;
  /** Called after a successful purge. */
  onDone?: () => void;
  /** Text the admin must type to confirm. Defaults to DELETE. */
  confirmWord?: string;
  className?: string;
}

/**
 * Admin-only hard-delete action. Permanently removes historical records to
 * free backend storage. Requires typing a confirmation word.
 */
export function PurgeDataButton({ label, title, description, rpc, params, onDone, confirmWord = 'DELETE', className }: Props) {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  if (role !== 'admin') return null;

  const run = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc(rpc as any, params as any);
    setBusy(false);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    const summary = data && typeof data === 'object'
      ? Object.entries(data as Record<string, any>).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ')
      : 'Done';
    toast({ title: 'Records permanently deleted', description: summary });
    setOpen(false);
    setTyped('');
    onDone?.();
  };

  return (
    <>
      <Button variant="destructive" size="sm" className={`gap-1.5 ${className || ''}`} onClick={() => setOpen(true)}>
        <Trash2 className="w-4 h-4" />{label}
      </Button>
      <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTyped(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>
              {description}
              <br /><br />
              <strong>This cannot be undone.</strong> Type <code>{confirmWord}</code> below to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">Confirmation</Label>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirmWord} autoFocus />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={typed.trim().toUpperCase() !== confirmWord.toUpperCase() || busy}
              onClick={(e) => { e.preventDefault(); run(); }}
            >
              {busy ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
