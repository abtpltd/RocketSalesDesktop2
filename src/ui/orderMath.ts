/** The web order editor's arithmetic (jumraOrderEditAngular.js), used here only to show totals while editing.
 *  The server prices the lines again when saving and its numbers are the ones stored. */
import type { EditLine } from '../api/types';

export function parseQty(text: string, uc: number): { text: string; q1: number; q2: number } | null {
  const m = /^\s*(\d*)(?:\.(\d+))?\s*$/.exec(text ?? '');
  if (!m || (m[1] === '' && m[2] === undefined)) return null;
  let q1 = m[1] ? parseInt(m[1], 10) : 0;
  if (m[2] === undefined) return { text: text.trim(), q1, q2: 0 };
  let q2 = parseInt(m[2], 10);
  const unit = Math.trunc(uc || 0);
  if (unit <= 0) return null;
  let t = text.trim();
  if (q2 >= uc) { q1 += Math.trunc(q2 / unit); q2 %= unit; t = `${q1}.${q2}`; }
  return { text: t, q1, q2 };
}

const fixed = (v: number, d: number) => parseFloat(v.toFixed(d));

/** inclusiveItemwise: price after discount; the tax is inside the total. */
export function priceLine(l: EditLine, q1: number, q2: number): EditLine {
  const price = l.rate - (l.rate * l.discount) / 100;
  const total = q1 * price + (q2 / l.uc) * price;
  const sub = (total * 100) / (l.tax + 100);
  return { ...l, qty_main: q1, qty_sub: q2, tax_amt: fixed(total - sub, 4), sb_amt: fixed(sub, 4), total: fixed(total, 4) };
}

/** recalcFund */
export function sumLines(lines: EditLine[]): { vat: number; sub: number; gt: number } {
  let vat = 0; let sub = 0;
  for (const l of lines) { vat += l.tax_amt ?? 0; sub += l.sb_amt ?? 0; }
  return { vat, sub, gt: vat + sub };
}
