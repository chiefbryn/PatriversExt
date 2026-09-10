import { Button } from '@/components/ui/button';
import { Printer, Eye, FileSpreadsheet } from 'lucide-react';
import { printReport, previewReport, exportXLSX } from '@/lib/printReport';

export interface RecordsReportData {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  alignRight?: number[];
  totalsRow?: (string | number)[];
}

interface Props {
  /** Lazily build the report payload at click time so it reflects current filters/data. */
  getData: () => RecordsReportData | null;
  disabled?: boolean;
  size?: 'sm' | 'default';
  /** Show only the icons (compact). */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Three-button toolbar (Print, Preview, Excel) that renders the current
 * filtered records — never the surrounding page chrome. Use everywhere a
 * page shows a list of records.
 */
export function RecordsToolbar({ getData, disabled, size = 'sm', iconOnly, className }: Props) {
  const handle = (mode: 'print' | 'preview' | 'xlsx') => {
    const d = getData();
    if (!d) return;
    if (mode === 'print') {
      printReport({
        title: d.title,
        subtitle: d.subtitle,
        headers: d.headers,
        rows: d.rows.map(r => r.map(String)),
        alignRight: d.alignRight,
        totalsRow: d.totalsRow?.map(String),
      });
    } else if (mode === 'preview') {
      previewReport({
        title: d.title,
        subtitle: d.subtitle,
        headers: d.headers,
        rows: d.rows.map(r => r.map(String)),
        alignRight: d.alignRight,
        totalsRow: d.totalsRow?.map(String),
      });
    } else {
      void exportXLSX({
        filename: d.filename,
        sheetName: d.title,
        headers: d.headers,
        rows: d.rows,
        totalsRow: d.totalsRow,
        alignRight: d.alignRight,
      });
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Button variant="outline" size={size} className="gap-1.5" disabled={disabled} onClick={() => handle('print')} title="Print">
        <Printer className="w-3.5 h-3.5" />{!iconOnly && <span>Print</span>}
      </Button>
      <Button variant="outline" size={size} className="gap-1.5" disabled={disabled} onClick={() => handle('preview')} title="Preview">
        <Eye className="w-3.5 h-3.5" />{!iconOnly && <span>Preview</span>}
      </Button>
      <Button variant="outline" size={size} className="gap-1.5" disabled={disabled} onClick={() => handle('xlsx')} title="Export Excel">
        <FileSpreadsheet className="w-3.5 h-3.5" />{!iconOnly && <span>Excel</span>}
      </Button>
    </div>
  );
}
