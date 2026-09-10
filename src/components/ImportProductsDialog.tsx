import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  name: string;
  qty: number;
  uom: string;
  cost_price: number;
  sales_price: number;
  category: string;
  supplier_name: string;
  batch_number: string;
  expiry_date: string;
  indication: string;
  error?: string;
}

const EXPECTED_HEADERS = ['name', 'qty', 'uom', 'cost_price', 'sales_price'];
const OPTIONAL_HEADERS = ['category', 'supplier_name', 'batch_number', 'expiry_date', 'indication'];

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(current.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        current = '';
      } else {
        current += ch;
      }
    }
  }
  row.push(current.trim());
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export function ImportProductsDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [importResult, setImportResult] = useState({ success: 0, failed: 0 });

  const reset = () => {
    setParsed([]);
    setFileName('');
    setStep('upload');
    setImportResult({ success: 0, failed: 0 });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) { toast.error('File has no data rows'); return; }

        const headers = rows[0].map(normalizeHeader);

        // Map common Aronium header variations
        const headerMap: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (h.includes('name') || h.includes('product') || h.includes('item') || h.includes('description')) headerMap['name'] = headers[i];
          if (h.includes('qty') || h.includes('quantity') || h.includes('stock') || h === 'on_hand') headerMap['qty'] = headers[i];
          if (h.includes('uom') || h.includes('unit') || h.includes('measure')) headerMap['uom'] = headers[i];
          if (h.includes('cost') || h.includes('purchase') || h.includes('buying')) headerMap['cost_price'] = headers[i];
          if (h.includes('sell') || h.includes('sales') || h.includes('retail') || h.includes('price')) headerMap['sales_price'] = headers[i];
          if (h.includes('category') || h.includes('group') || h.includes('type')) headerMap['category'] = headers[i];
          if (h.includes('supplier') || h.includes('vendor')) headerMap['supplier_name'] = headers[i];
          if (h.includes('batch') || h.includes('lot')) headerMap['batch_number'] = headers[i];
          if (h.includes('expiry') || h.includes('expiration') || h.includes('exp_date') || h.includes('best_before')) headerMap['expiry_date'] = headers[i];
          if (h.includes('indication') || h.includes('use') || h.includes('treatment')) headerMap['indication'] = headers[i];
        });

        // Check required
        const missing = EXPECTED_HEADERS.filter(h => {
          if (h === 'name') return !headerMap['name'];
          return false; // others optional with defaults
        });
        if (missing.length > 0 && !headerMap['name']) {
          toast.error('CSV must have a "Name" or "Product" column');
          return;
        }

        const dataRows = rows.slice(1);
        const items: ParsedRow[] = dataRows.map(row => {
          const get = (field: string) => {
            const mapped = headerMap[field];
            if (!mapped) return '';
            const idx = headers.indexOf(mapped);
            return idx >= 0 ? (row[idx] || '') : '';
          };

          const name = get('name');
          const qty = parseInt(get('qty')) || 0;
          const uom = get('uom') || 'Tablet';
          const cost_price = parseFloat(get('cost_price')) || 0;
          const sales_price = parseFloat(get('sales_price')) || 0;
          const category = get('category') || 'General';
          const supplier_name = get('supplier_name');
          const batch_number = get('batch_number');
          const expiry_date = get('expiry_date');
          const indication = get('indication');

          let error: string | undefined;
          if (!name) error = 'Missing product name';

          return { name, qty, uom, cost_price, sales_price, category, supplier_name, batch_number, expiry_date, indication, error };
        }).filter(r => r.name || r.error);

        setParsed(items);
        setStep('preview');
      } catch {
        toast.error('Failed to parse file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    const valid = parsed.filter(r => !r.error);
    if (valid.length === 0) { toast.error('No valid rows to import'); return; }

    setImporting(true);
    let success = 0;
    let failed = 0;

    // Batch insert in chunks of 50
    for (let i = 0; i < valid.length; i += 50) {
      const chunk = valid.slice(i, i + 50).map(r => ({
        name: r.name,
        qty: r.qty,
        uom: r.uom,
        cost_price: r.cost_price,
        sales_price: r.sales_price,
        category: r.category,
        supplier_name: r.supplier_name || null,
        batch_number: r.batch_number || null,
        expiry_date: r.expiry_date || null,
        indication: r.indication || null,
      }));

      const { data, error } = await supabase.from('products').insert(chunk).select('id');
      if (error) {
        failed += chunk.length;
      } else {
        success += data.length;
      }
    }

    setImportResult({ success, failed });
    setStep('done');
    setImporting(false);
    qc.invalidateQueries({ queryKey: ['products'] });
    toast.success(`Imported ${success} product${success !== 1 ? 's' : ''}`);
  };

  const downloadTemplate = () => {
    const csv = 'Name,Qty,UOM,Cost Price,Sales Price,Category,Supplier,Batch Number,Expiry Date,Indication\nParacetamol 500mg,100,Tablet,2.50,5.00,Analgesics,Ernest Chemists,BN-001,2027-06-30,Relieves headache and fever\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = parsed.filter(r => !r.error).length;
  const errorCount = parsed.filter(r => r.error).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Products</DialogTitle>
          <DialogDescription>
            Import products from a CSV file (e.g. exported from Aronium or any POS system)
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-accent/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium">Click to upload CSV file</p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports CSV exports from Aronium and other POS systems
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="text-xs font-medium">Need a template?</p>
                <p className="text-[10px] text-muted-foreground">Download a sample CSV with the correct column format</p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> Template
              </Button>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Expected columns:</p>
              <p><strong>Required:</strong> Name (or Product / Item / Description)</p>
              <p><strong>Optional:</strong> Qty, UOM, Cost Price, Sales Price, Category, Supplier, Batch Number, Expiry Date, Indication</p>
              <p className="text-[10px]">Column headers are matched flexibly — e.g. "Selling Price", "Retail Price", or "Sales Price" all work.</p>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1"><FileSpreadsheet className="w-3 h-3" /> {fileName}</Badge>
              <Badge className="bg-accent text-accent-foreground gap-1"><CheckCircle2 className="w-3 h-3" /> {validCount} valid</Badge>
              {errorCount > 0 && <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> {errorCount} errors</Badge>}
            </div>

            <div className="border rounded-lg overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.slice(0, 100).map((r, i) => (
                    <TableRow key={i} className={r.error ? 'bg-destructive/5' : ''}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium text-sm">{r.name || '—'}</TableCell>
                      <TableCell className="text-right">{r.qty}</TableCell>
                      <TableCell>{r.uom}</TableCell>
                      <TableCell className="text-right">GH₵ {r.cost_price.toFixed(2)}</TableCell>
                      <TableCell className="text-right">GH₵ {r.sales_price.toFixed(2)}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell>
                        {r.error
                          ? <Badge variant="destructive" className="text-[10px]">{r.error}</Badge>
                          : <Badge className="bg-accent text-accent-foreground text-[10px]">Ready</Badge>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsed.length > 100 && (
              <p className="text-xs text-muted-foreground text-center">Showing first 100 of {parsed.length} rows</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={handleImport} disabled={importing || validCount === 0} className="gap-2">
                {importing ? 'Importing...' : `Import ${validCount} product${validCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-8 space-y-4">
            <CheckCircle2 className="w-12 h-12 mx-auto text-accent" />
            <div>
              <p className="text-lg font-semibold">{importResult.success} products imported</p>
              {importResult.failed > 0 && (
                <p className="text-sm text-destructive">{importResult.failed} rows failed</p>
              )}
            </div>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
