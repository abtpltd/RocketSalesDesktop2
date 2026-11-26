// Reading upload files the way the web pages' scripts read them (RouteplanExpese.js, uploadContactsApi.js,
// UploadSalesInvoiceCSV.js). The server checks everything again before saving.
export type Cell = string | number | boolean | Date | null | undefined;
export type Table = Cell[][];

const text = (v: Cell) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v));

/** Reads the first sheet of an .xlsx file, or a .csv file, into rows of cells. */
export async function readTable(file: File): Promise<Table> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx') {
    const { readSheet } = await import('read-excel-file/browser');
    return (await readSheet(file)) as Table;
  }
  if (ext === 'csv') {
    const Papa = (await import('papaparse')).default;
    const raw = await file.text();
    return Papa.parse<string[]>(raw, { header: false, skipEmptyLines: true }).data as Table;
  }
  throw new Error('Choose an .xlsx or .csv file.');
}

/** The first row that has the key column (headers trimmed, in capitals, spaces as `space`), and the rows after it. */
export function fromHeader(table: Table, key: string, space: string): { headers: string[]; rows: Table } | null {
  for (let i = 0; i < table.length; i++) {
    const headers = (table[i] ?? []).map((h) => text(h).trim().toUpperCase().replace(/\s+/g, space));
    if (headers.includes(key) && headers.length >= 2) return { headers, rows: table.slice(i + 1) };
  }
  return null;
}

/** parseInt as the web scripts use it: the leading whole number, else 0. */
export function webInt(v: Cell): number {
  const n = parseInt(text(v), 10);
  return Number.isNaN(n) ? 0 : n;
}

// ---- route plan expenses ----
export const EXPENSE_COLUMNS = ['CODE', 'EXPENSE_TYPE', 'EXPENSE_HEAD', 'EXPENSE_AMOUNT'];
export interface ExpenseLine { EXPENSE_TYPE: string; EXPENSE_HEAD: string; EXPENSE_AMOUNT: number }

export function expenseRows(table: Table, heads: string[], types: string[]) {
  const found = fromHeader(table, 'CODE', '_');
  if (!found) return { error: "The file has no 'CODE' column.", rows: {}, skipped: [] as string[], lines: 0 };
  const missing = EXPENSE_COLUMNS.filter((c) => !found.headers.includes(c));
  if (missing.length) return { error: `The file needs these columns: ${missing.join(', ')}.`, rows: {}, skipped: [], lines: 0 };
  const at = (c: string) => found.headers.indexOf(c);
  const rows: Record<string, ExpenseLine[]> = {};
  const skipped: string[] = [];
  let lines = 0;
  found.rows.forEach((r, i) => {
    const code = text(r[at('CODE')]).trim();
    if (!code) return;
    const line = i + 2;
    const head = text(r[at('EXPENSE_HEAD')]).toUpperCase();
    const type = text(r[at('EXPENSE_TYPE')]).toUpperCase();
    const amount = webInt(r[at('EXPENSE_AMOUNT')]);
    if (!heads.includes(head)) { skipped.push(`Line ${line}: expense head "${head}" is not in the settings, left out.`); return; }
    if (!types.includes(type)) { skipped.push(`Line ${line}: expense type "${type}" is not DAILY, WEEKLY or MONTHLY, left out.`); return; }
    if (!amount) { skipped.push(`Line ${line}: amount is 0, left out.`); return; }
    (rows[code] ??= []).push({ EXPENSE_TYPE: type, EXPENSE_HEAD: head, EXPENSE_AMOUNT: amount });
    lines += 1;
  });
  return { error: '', rows, skipped, lines };
}

// ---- sales invoice CSV ----
export const INVOICE_HEADERS = ['Date', 'InvoiceNo', 'Amount', 'CustomerCode', 'Salesmen'];

/** The web script needs every header spelled exactly; values are trimmed and put in capitals. */
export function invoiceRows(table: Table) {
  const header = (table[0] ?? []).map((h) => text(h).trim());
  const missing = INVOICE_HEADERS.find((h) => !header.includes(h));
  if (missing) return { error: `Required header not in file: ${missing}`, rows: [] as Record<string, string>[] };
  const rows = table.slice(1).filter((r) => r.some((c) => text(c).trim()))
    .map((r) => Object.fromEntries(INVOICE_HEADERS.map((h) => [h, text(r[header.indexOf(h)]).trim().toUpperCase().replace(/"/g, ' ')])));
  return { error: rows.length ? '' : 'File contains no data.', rows };
}

// ---- customer contacts ----
export const CONTACT_COLUMNS = ['CUSTOMER CODE', 'CONTACT NAME', 'DESIGNATION', 'EMAIL', 'PHONE', 'LOCATION NAME', 'LOCATION TAG'];

/** {CODE: [contact]} and {CODE: [{t, g}]}, with the field names the web script makes from the column titles. */
export function contactRows(table: Table) {
  const found = fromHeader(table, 'CUSTOMER CODE', ' ');
  const empty = { data: {} as Record<string, Record<string, string>[]>, tags: {} as Record<string, Record<string, string>[]>, headers: [] as string[], rows: 0 };
  if (!found) return { ...empty, error: "The file has no 'CUSTOMER CODE' column." };
  const matched = found.headers.filter((h) => CONTACT_COLUMNS.includes(h));
  if (matched.length < 2) return { ...empty, error: "The file needs 'CUSTOMER CODE' and at least one more column." };
  const at = (c: string) => found.headers.indexOf(c);
  const data: Record<string, Record<string, string>[]> = {};
  const tags: Record<string, Record<string, string>[]> = {};
  let rows = 0;
  for (const r of found.rows) {
    const code = text(r[at('CUSTOMER CODE')]).trim().toUpperCase();
    if (!code) continue;
    const contact: Record<string, string> = {};
    const tag: Record<string, string> = {};
    for (const h of matched) {
      const v = text(r[at(h)]);
      if (h !== 'CUSTOMER CODE' && h !== 'LOCATION NAME') contact[h.toLowerCase().replace('tag', '').replace('contact', '').trim()] = v;
      if (h === 'LOCATION NAME') tag.t = v;
      if (h === 'LOCATION TAG') tag.g = v;
    }
    (data[code] ??= []).push(contact);
    (tags[code] ??= []).push(tag);
    rows += 1;
  }
  return { error: rows ? '' : 'The file has no rows.', data, tags, headers: matched, rows };
}
