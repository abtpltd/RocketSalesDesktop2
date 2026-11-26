import type { SparePart } from '../../api/types';
import { fromHeader, type Table } from '../../tools/fileRows';

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** Rows of an uploaded spare parts file, as js/uploadSpareParts.js reads them: the header row has PRODUCTCODE, codes and
 *  UOM go to capitals. Rows repeated in the file are left out. */
export function partsFromTable(table: Table): { rows: SparePart[]; problems: string[] } {
  const found = fromHeader(table, 'PRODUCTCODE', ' ');
  if (!found) return { rows: [], problems: ["The file has no 'PRODUCTCODE' column."] };
  const at = (c: string) => found.headers.indexOf(c);
  const missing = ['PARTCODE', 'PART NAME', 'UOM', 'PRICE'].filter((c) => at(c) < 0);
  const problems = missing.length ? [`These columns are missing and will be empty: ${missing.join(', ')}.`] : [];
  const rows: SparePart[] = [];
  const seen = new Set<string>();
  found.rows.forEach((r, i) => {
    const c = text(r[at('PRODUCTCODE')]).toUpperCase();
    if (!c) return;
    const pc = at('PARTCODE') >= 0 ? text(r[at('PARTCODE')]) : '';
    const raw = at('PRICE') >= 0 ? text(r[at('PRICE')]) : '';
    const price = raw === '' ? '' : Number(raw.replace(/,/g, ''));
    if (price !== '' && Number.isNaN(price)) { problems.push(`Line ${i + 2}: price "${raw}" is not a number, left out.`); return; }
    const k = `${c}|${pc}`;
    if (seen.has(k)) { problems.push(`Line ${i + 2}: ${c} ${pc} is repeated, left out.`); return; }
    seen.add(k);
    rows.push({ c, pc, pn: at('PART NAME') >= 0 ? text(r[at('PART NAME')]) : '', uom: at('UOM') >= 0 ? text(r[at('UOM')]).toUpperCase() : '', pr: price });
  });
  return { rows, problems };
}
