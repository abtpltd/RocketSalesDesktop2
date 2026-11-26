import type { Answer } from './types';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
/** A plain printable page for one answer (also saved as PDF from the print window). */
export function answerHtml(a: Answer, rows?: Record<string, unknown>[], title = 'RocketPilot AI'): string {
  const t = a.table;
  const body = [
    `<h1>${esc(title)}</h1>`, `<p class="q">${esc(a.text)}</p>`,
    t ? `<table><thead><tr>${t.columns.map((c) => `<th${c.right ? ' class="r"' : ''}>${esc(c.title)}</th>`).join('')}</tr></thead><tbody>${(rows ?? t.all).map((r) => `<tr>${t.columns.map((c) => `<td${c.right ? ' class="r"' : ''}>${esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '',
    ...(a.bars ?? []).map((b) => `<p>${esc(b.label)}: ${esc(b.shown)}</p>`), ...(a.lines ?? []).map((l) => `<p>${esc(l.text)}</p>`),
    ...a.notes.map((n) => `<p class="n">${esc(n)}</p>`), a.source ? `<p class="n">Source: ${esc(a.source)}</p>` : '',
  ].join('');
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:13px Segoe UI,Arial,sans-serif;margin:24px;color:#111}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#eee}.r{text-align:right}.n{color:#555;font-size:11px}</style>${body}`;
}
export function printAnswer(a: Answer, rows?: Record<string, unknown>[]): boolean {
  try {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const d = f.contentWindow?.document;
    if (!d || !f.contentWindow) { f.remove(); return false; }
    d.open(); d.write(answerHtml(a, rows)); d.close();
    setTimeout(() => { try { f.contentWindow?.focus(); f.contentWindow?.print(); } finally { setTimeout(() => f.remove(), 2000); } }, 150);
    return true;
  } catch { return false; }
}
