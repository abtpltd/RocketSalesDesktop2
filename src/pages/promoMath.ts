// App Promo (js/api/promoMasterNewApi.js): the line fields of each offer type, the web's add-button checks, and the
// product codes an offer applies to. The server checks everything again before saving.
import type { PromoLine } from '../api/types';

export type FieldKind = 'product' | 'products' | 'number' | 'uom';
export interface LineField { key: string; label: string; kind: FieldKind }

const P = (key: string, label: string): LineField => ({ key, label, kind: 'product' });
const N = (key: string, label: string): LineField => ({ key, label, kind: 'number' });
const U = (key: string, label: string): LineField => ({ key, label, kind: 'uom' });
const B: LineField = { key: 'c', label: 'Products in the bundle', kind: 'products' };

/** Fields per offer type, in the order the web page writes them. */
export const LINE_FIELDS: Record<string, LineField[]> = {
  'Item Slabs Rate': [P('c', 'Product'), N('r', 'Rate'), N('fq', 'From qty'), N('tq', 'To qty')],
  'Item Slabs Discount': [P('c', 'Product'), N('d', 'Discount %'), N('fq', 'From qty'), N('tq', 'To qty')],
  'Item Slabs Free': [P('sc', 'Selling product'), P('oc', 'Free product'), N('sq', 'Sell qty'), N('oq', 'Free qty')],
  'Item Free PCS': [P('sc', 'Selling product'), P('oc', 'Free product'), N('sq', 'Sell qty'), N('oq', 'Free qty')],
  'Free Item Advance': [P('sc', 'Selling product'), P('oc', 'Free product'), N('sq', 'Sell qty'), U('su', 'Sell unit'), N('oq', 'Free qty'), U('ou', 'Free unit')],
  'Items Bundle Discount': [B, N('d', 'Discount %'), N('fq', 'From qty'), N('tq', 'To qty')],
  'Items Bundle Free': [B, N('sq', 'Sell qty'), P('oc', 'Free product'), N('oq', 'Free qty')],
  'Items Bundle Rate': [B, N('q', 'Qty'), N('r', 'Rate')],
};

/** A new empty line of an offer type (numbers start at 1 like the web inputs, units at CTN). */
export function blankLine(type: string): PromoLine {
  const line: PromoLine = {};
  for (const f of LINE_FIELDS[type] ?? []) line[f.key] = f.kind === 'products' ? [] : f.kind === 'number' ? 1 : f.kind === 'uom' ? 'CTN' : '';
  return line;
}

/** The web page's checks for one line; null when fine, otherwise the message it shows. */
export function lineProblem(type: string, line: PromoLine): string | null {
  for (const f of LINE_FIELDS[type] ?? []) {
    const v = line[f.key];
    if (f.kind === 'products' && (!Array.isArray(v) || v.length === 0)) return 'Add products in product group First!';
    if (f.kind === 'product' && !v) return `Select ${f.label}!`;
    if (f.kind === 'number' && !(Number(v) > 0)) return `Enter ${f.label}!`;
  }
  if ('fq' in line && Number(line.fq) > Number(line.tq)) return 'Invalid Qty Range!';
  return null;
}

/** CD: the product codes the offer applies to (prepareFinalDTA), first-seen order without repeats. */
export function offerCodes(type: string, lines: PromoLine[]): string[] {
  const out: string[] = [];
  for (const d of lines) {
    const codes = type.includes('Bundle') ? (d.c as string[] | undefined) ?? []
      : ['Item Slabs Free', 'Item Free PCS', 'Free Item Advance'].includes(type) ? [d.sc as string] : [d.c as string];
    for (const c of codes) if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

/** "Group discount": one Item Slabs Discount line per product of the chosen groups. */
export function groupLines(products: { c: string; g: string }[], groups: string[], fq: number, tq: number, d: number): PromoLine[] {
  return products.filter((p) => groups.includes(p.g)).map((p) => ({ c: p.c, d, fq, tq }));
}
