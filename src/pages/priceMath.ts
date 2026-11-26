import { fromHeader, type Table } from '../tools/fileRows';

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** Rows of a price list file: the header row has PRODUCT CODE; the rate is AMOUNT (the web's upload column), else RATE,
 *  else EXCLUSIVE PRICE (the web's download for some companies). */
export function priceRows(table: Table): { rows: { code: string; rate: number | string }[]; problems: string[] } {
  const found = fromHeader(table, 'PRODUCT CODE', ' ');
  if (!found) return { rows: [], problems: ["The file has no 'PRODUCT CODE' column."] };
  const col = ['AMOUNT', 'RATE', 'EXCLUSIVE PRICE'].map((c) => found.headers.indexOf(c)).find((i) => i >= 0);
  if (col === undefined) return { rows: [], problems: ["The file needs an 'AMOUNT' column with the rates."] };
  const code = found.headers.indexOf('PRODUCT CODE');
  const rows: { code: string; rate: number | string }[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  found.rows.forEach((r, i) => {
    const c = text(r[code]).toUpperCase();
    if (!c) return;
    const raw = text(r[col]).replace(/,/g, '');
    const n = Number(raw);
    if (raw === '' || Number.isNaN(n) || n < 0) { problems.push(`Line ${i + 2}: ${c} has no valid rate, left out.`); return; }
    if (seen.has(c)) { problems.push(`Line ${i + 2}: ${c} is repeated, left out.`); return; }
    seen.add(c);
    rows.push({ code: c, rate: n });
  });
  return { rows, problems };
}
