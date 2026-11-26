// Hospital - Doctor mapping upload: read the file's rows and check them the way the server does (same rules as
// src/business_logic/hospital_doctor_map.py). The server checks again against the real hospitals, doctors and links.
import type { Table } from './fileRows';

export const MAP_COLUMNS = ['HOSPITAL CODE', 'DOCTOR CODE', 'REP'];
export const MAP_MAX_ROWS = 5000;

export type MapStatus = 'pending' | 'new' | 'exists' | 'error';
export interface MapFileRow { row: number; hospital_code: string; doctor_code: string; rep: string }
export interface MapRow extends MapFileRow {
  status: MapStatus; message: string; hospital_name?: string; doctor_name?: string;
}

const cell = (v: unknown) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v).trim());
const head = (v: unknown) => cell(v).toUpperCase().replace(/\s+/g, ' ');

/** The header row (it has HOSPITAL CODE and DOCTOR CODE) and the data rows after it, each with its line number in the file. */
export function mapFileRows(table: Table): { rows: MapFileRow[]; error: string } {
  let at = -1;
  let headers: string[] = [];
  for (let i = 0; i < table.length; i++) {
    const h = (table[i] ?? []).map(head);
    if (h.includes('HOSPITAL CODE') && h.includes('DOCTOR CODE')) { at = i; headers = h; break; }
  }
  if (at < 0) return { rows: [], error: "The header row must have 'HOSPITAL CODE' and 'DOCTOR CODE' columns." };
  const ix = (n: string) => headers.indexOf(n);
  const get = (r: unknown[], n: string) => (ix(n) < 0 ? '' : cell(r[ix(n)]));
  const rows: MapFileRow[] = [];
  for (let i = at + 1; i < table.length; i++) {
    const r = table[i] ?? [];
    const row = { row: i + 1, hospital_code: get(r, 'HOSPITAL CODE'), doctor_code: get(r, 'DOCTOR CODE'), rep: get(r, 'REP') };
    if (row.hospital_code || row.doctor_code || row.rep) rows.push(row);
  }
  if (!rows.length) return { rows, error: 'The file has no data rows.' };
  if (rows.length > MAP_MAX_ROWS) return { rows: [], error: `Too many rows (${rows.length}). Upload at most ${MAP_MAX_ROWS} rows at a time.` };
  return { rows, error: '' };
}

/** First check, on this computer: empty codes, the same pair twice. */
export function formatCheck(rows: MapFileRow[]): MapRow[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const h = r.hospital_code.toUpperCase();
    const d = r.doctor_code.toUpperCase();
    let err = '';
    if (!h && !d) err = 'Hospital code and doctor code are empty.';
    else if (!h) err = 'Hospital code is empty.';
    else if (!d) err = 'Doctor code is empty.';
    else if (seen.has(`${h}|${d}`)) err = `Same hospital and doctor as row ${seen.get(`${h}|${d}`)}.`;
    if (!err) seen.set(`${h}|${d}`, r.row);
    return { ...r, hospital_code: h, doctor_code: d, status: err ? 'error' : 'pending', message: err || 'Checking with the server...' } as MapRow;
  });
}

export function countRows(rows: MapRow[]) {
  const c = { all: rows.length, fine: 0, linked: 0, bad: 0, pending: 0 };
  rows.forEach((r) => {
    if (r.status === 'new') c.fine += 1;
    else if (r.status === 'exists') c.linked += 1;
    else if (r.status === 'pending') c.pending += 1;
    else c.bad += 1;
  });
  return c;
}

/** What goes to the server: only the correct rows. */
export function uploadRows(rows: MapRow[]) {
  return rows.filter((r) => r.status === 'new').map((r) => ({
    row: r.row, hospital_code: r.hospital_code, doctor_code: r.doctor_code,
    rep: r.rep,
  }));
}

export const SAMPLE_ROWS = [
  { HOSPITAL_CODE: 'H001', DOCTOR_CODE: 'D001', REP: '' },
  { HOSPITAL_CODE: 'H001', DOCTOR_CODE: 'D002', REP: '' },
  { HOSPITAL_CODE: 'H002', DOCTOR_CODE: 'D001', REP: 'Rep Name' },
];
