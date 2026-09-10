import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { toast } from 'sonner';


interface PrintReportOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
  alignRight?: number[];
  totalsRow?: string[];
}

let companyCache: any = null;

async function getCompany() {
  if (companyCache) return companyCache;
  const { data } = await supabase.from('company_settings').select('*').limit(1).single();
  companyCache = data;
  return data;
}

/**
 * Build the full HTML for a print report.
 */
function buildHtml(opts: PrintReportOptions, company: any): string {
  const rightCols = new Set(opts.alignRight || []);
  const headerRow = opts.headers
    .map((h, i) => `<th${rightCols.has(i) ? ' class="text-right"' : ''}>${h}</th>`)
    .join('');
  const bodyRows = opts.rows
    .map(
      (row) =>
        '<tr>' +
        row
          .map((cell, i) => `<td${rightCols.has(i) ? ' class="text-right"' : ''}>${cell}</td>`)
          .join('') +
        '</tr>',
    )
    .join('');
  const totalsHtml = opts.totalsRow
    ? '<tr class="totals">' +
      opts.totalsRow
        .map((cell, i) => `<td${rightCols.has(i) ? ' class="text-right"' : ''}>${cell}</td>`)
        .join('') +
      '</tr>'
    : '';

  const generated = format(new Date(), 'dd/MM/yyyy HH:mm');
  const companyName = company?.company_name || 'Patrivers Pharmacy';
  const addressLine = [company?.address, company?.city, company?.region].filter(Boolean).join(', ');
  const phoneLine = [company?.phone_primary, company?.phone_secondary].filter(Boolean).join(' / ');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${opts.title}</title>
<style>
  /* ===== Office-style A4 inventory report =====
     Print preview and printed output are identical: 100% black ink on white,
     no grey shading, no zebra striping. */
  @page { size: A4 portrait; margin: 10mm 8mm 12mm 8mm; }
  * { box-sizing: border-box; }
  html, body { background:#fff; margin:0; padding:0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color:#000; font-size:9px; line-height:1.25; -webkit-print-color-adjust:exact; print-color-adjust:exact; }

  .doc-header { border-bottom:1.5pt solid #000; padding-bottom:3pt; margin-bottom:4pt; }
  .doc-header .row { display:flex; justify-content:space-between; align-items:flex-start; gap:8pt; }
  .doc-header .company { font-size:13pt; font-weight:700; letter-spacing:.3pt; margin:0; color:#000; }
  .doc-header .meta { font-size:7.5pt; color:#000; line-height:1.3; }
  .doc-header .meta div { margin:0; }
  .doc-header .gen { text-align:right; font-size:7.5pt; color:#000; line-height:1.3; white-space:nowrap; }

  .report-title { text-align:center; font-size:11pt; font-weight:700; text-transform:uppercase; letter-spacing:.6pt; margin:4pt 0 1pt; color:#000; }
  .report-sub   { text-align:center; font-size:8pt; color:#000; margin:0 0 4pt; }

  table { width:100%; border-collapse:collapse; font-size:8pt; table-layout:auto; color:#000; }
  thead { display:table-header-group; }
  tfoot { display:table-row-group; }
  th, td { border:0.5pt solid #000; padding:1.5pt 3pt; text-align:left; vertical-align:top; line-height:1.2; word-break:break-word; background:#fff !important; color:#000; }
  th { background:#fff !important; font-weight:700; font-size:8pt; text-transform:uppercase; letter-spacing:.2pt; border-bottom:1pt solid #000; }
  tbody tr { page-break-inside:avoid; }
  .text-right { text-align:right; }
  tfoot td { font-weight:700; background:#fff !important; border-top:1pt solid #000; }

  .doc-footer { margin-top:4pt; padding-top:2pt; border-top:0.5pt solid #000; text-align:center; font-size:7pt; color:#000; }

  @media print {
    body { margin:0; padding:0; max-width:none; box-shadow:none; }
    .no-print, nav, header.app-header, aside, button { display:none !important; }
  }
  @media screen {
    body { padding:10mm; max-width:210mm; margin:0 auto; box-shadow:0 0 8px rgba(0,0,0,.1); }
  }
</style></head><body>
<div class="doc-header">
  <div class="row">
    <div>
      <h1 class="company">${companyName}</h1>
      <div class="meta">
        ${addressLine ? `<div>${addressLine}</div>` : ''}
        ${phoneLine ? `<div>Tel: ${phoneLine}</div>` : ''}
        ${company?.email ? `<div>${company.email}</div>` : ''}
      </div>
    </div>
    <div class="gen">
      <div><strong>Document No.</strong></div>
      <div>RPT-${Date.now().toString().slice(-8)}</div>
      <div><strong>Generated:</strong> ${generated}</div>
    </div>
  </div>
</div>
<div class="report-title">${opts.title}</div>
${opts.subtitle ? `<div class="report-sub">${opts.subtitle}</div>` : ''}
<table>
  <thead><tr>${headerRow}</tr></thead>
  <tbody>${bodyRows}</tbody>
  ${totalsHtml ? `<tfoot>${totalsHtml}</tfoot>` : ''}
</table>
<div class="doc-footer">${companyName} &middot; Generated ${generated} &middot; This is a system-generated inventory report.</div>
</body></html>`;
}

/**
 * Render and print HTML via a hidden iframe.
 *
 * Key correctness rules:
 *  - The iframe must be in the DOM BEFORE writing into it.
 *  - print() must be invoked from INSIDE the iframe (via an injected
 *    script) — calling iframe.contentWindow.print() from the parent
 *    causes some browsers (notably Chrome) to print the host page.
 *  - We wait for window.onload inside the iframe so images/fonts are
 *    ready before the print dialog opens.
 */
function printViaIframe(html: string) {
  // Remove any previous print frame to avoid stacking
  document.querySelectorAll('iframe[data-print-frame]').forEach(el => el.remove());

  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-print-frame', '1');
  // Hidden but still rendered (display:none can break print in some browsers)
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    toast.error('Unable to prepare print preview');
    return;
  }

  // No inline script is injected (the Content Security Policy forbids it). We wait for
  // the frame's own load event, focus the frame window and print it from there.
  const frameWindow = iframe.contentWindow;
  const go = () => {
    try {
      frameWindow?.focus();
      frameWindow?.print();
    } catch { /* ignore */ }
  };
  const armPrint = () => {
    const d = iframe.contentDocument;
    if (d && d.readyState === 'complete') setTimeout(go, 50);
    else frameWindow?.addEventListener('load', () => setTimeout(go, 50), { once: true });
  };

  doc.open();
  doc.write(html);
  doc.close();
  armPrint();

  // Cleanup after the print dialog has had time to open & close
  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 60_000);
}

/**
 * Print a tabular report. Uses a hidden iframe so it works regardless of
 * popup blockers and async data loading. MUST be called from a user gesture
 * (click handler) for the browser print dialog to appear reliably.
 */
export async function printReport(opts: PrintReportOptions) {
  try {
    const company = await getCompany();
    const html = buildHtml(opts, company);
    printViaIframe(html);
  } catch (err) {
    console.error('printReport error', err);
    toast.error('Could not generate print preview');
  }
}

/**
 * Print arbitrary HTML (for thermal receipts etc.) via a hidden iframe.
 */
export function printHTML(html: string) {
  printViaIframe(html);
}

/**
 * Open the same report HTML in a new browser tab for preview before printing.
 * Adds a small floating toolbar (Print, Close) at the top of the preview.
 */
export async function previewReport(opts: PrintReportOptions) {
  try {
    const company = await getCompany();
    const html = buildHtml(opts, company);
    const toolbar = `
      <div id="__preview_toolbar" style="position:fixed;top:0;left:0;right:0;background:#0f172a;color:#fff;padding:8px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;z-index:9999;font-family:Arial,sans-serif;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.2);">
        <span><strong>${opts.title}</strong>${opts.subtitle ? ' &middot; ' + opts.subtitle : ''}</span>
        <span>
          <button id="__preview_print" style="background:#22c55e;color:#fff;border:0;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:600;margin-right:6px;">Print</button>
          <button id="__preview_close" style="background:#475569;color:#fff;border:0;padding:6px 14px;border-radius:4px;cursor:pointer;">Close</button>
        </span>
      </div>
      <style>@media print { #__preview_toolbar { display:none !important; } body { padding-top:0 !important; } } body { padding-top:48px; }</style>
    `;
    const finalHtml = html.includes('<body>') ? html.replace('<body>', '<body>' + toolbar) : toolbar + html;
    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked. Allow pop-ups to preview.'); return; }
    win.document.open();
    win.document.write(finalHtml);
    win.document.close();
    // Wire the toolbar from here instead of inline handlers (blocked by CSP).
    win.document.getElementById('__preview_print')?.addEventListener('click', () => win.print());
    win.document.getElementById('__preview_close')?.addEventListener('click', () => win.close());
  } catch (err) {
    console.error('previewReport error', err);
    toast.error('Could not open preview');
  }
}

/**
 * Export the same report data as a real .xlsx file. Headers become the first
 * sheet row, then data rows, then an optional totals row. Right-aligned
 * columns get a numeric format when the value looks like a number.
 */
export async function exportXLSX(opts: {
  filename: string;
  sheetName?: string;
  headers: string[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  alignRight?: number[];
}) {
  try {
    // The spreadsheet library is large and only needed on export, so load it on demand.
    const XLSX = await import('xlsx');
    const data: (string | number)[][] = [opts.headers, ...opts.rows];
    if (opts.totalsRow) data.push(opts.totalsRow);
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Auto column widths
    const colWidths = opts.headers.map((h, i) => {
      const maxLen = Math.max(
        String(h).length,
        ...opts.rows.map(r => String(r[i] ?? '').length),
        opts.totalsRow ? String(opts.totalsRow[i] ?? '').length : 0,
      );
      return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
    });
    (ws as any)['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, (opts.sheetName || 'Report').slice(0, 31));
    XLSX.writeFile(wb, `${opts.filename}.xlsx`);
    toast.success('Excel file downloaded');
  } catch (err) {
    console.error('exportXLSX error', err);
    toast.error('Could not export Excel');
  }
}

