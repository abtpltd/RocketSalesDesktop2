// Helpers for reading the saved copies: dates, periods, one merged view of several saved date ranges.
import { parseDay } from '../ui/rowTone';
import type { AssistantSettings } from '../api/types';
import type { Copy, Period, Row } from './types';

export const REPORT_PATH: Record<string, string> = {
  attendance: '/Report/Attendance', last_activity: '/Report/CustomersLastVisitsOrdersHistory', expiry: '/Report/ExpiryReport',
  customer_ageing: '/Report/CustomerPurchaseAgeingReport', target_vs_sales: '/Report/TargetVsSalesReport', visits: '/Report/VisitReport',
};
export const REPORT_LABEL: Record<string, string> = {
  attendance: 'Attendance', last_activity: 'Last Activity', expiry: 'Expiry', customer_ageing: 'Customer Ageing',
  target_vs_sales: 'Target vs Sales', visits: 'Visit Report',
};

export const num = (v: unknown): number => { const n = parseFloat(String(v ?? '').replace(/[, ]/g, '')); return Number.isFinite(n) ? n : 0; };
export const text = (v: unknown): string => String(v ?? '').trim();
export const money = (n: number): string => Math.round(n).toLocaleString('en-US');
export const pct = (n: number): string => `${Math.round(n)}%`;
const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDay = (d: Date): string => `${d.getDate()} ${MON[d.getMonth()]}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** The first and last day a period means, counted from `today` (weeks start on Monday). */
export function periodRange(p: Period, today: Date): [Date, Date] {
  const t = startOfDay(today);
  const monday = addDays(t, -((t.getDay() + 6) % 7));
  switch (p) {
    case 'today': return [t, t];
    case 'yesterday': return [addDays(t, -1), addDays(t, -1)];
    case 'week': return [monday, t];
    case 'lastweek': return [addDays(monday, -7), addDays(monday, -1)];
    case 'month': return [new Date(t.getFullYear(), t.getMonth(), 1), t];
    case 'lastmonth': return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)];
  }
}
export const PERIOD_WORDS: Record<Period, string> = { today: 'today', yesterday: 'yesterday', week: 'this week', lastweek: 'last week', month: 'this month', lastmonth: 'last month' };

export function inPeriod(rows: Row[], p: Period | undefined, today: Date): Row[] {
  if (!p) return rows;
  const [a, b] = periodRange(p, today);
  return rows.filter((r) => { const d = parseDay(r.date); return !d || (d >= a && d <= b); });
}

export interface Merged { rows: Row[]; from: string; to: string; savedAt: number; partial: boolean; copies: Copy[] }
/** Several saved date ranges of one report as one list of rows (a row saved twice counts once). */
export function merge(copies: Copy[]): Merged {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const c of copies) for (const r of c.rows) {
    if (r.key == null && !r.date) { rows.push(r); continue; }
    const k = `${text(r.key)}|${text(r.date)}|${text(r.rep ?? r.code ?? r.name)}|${text(r.product)}`;
    if (!seen.has(k)) { seen.add(k); rows.push(r); }
  }
  const froms = copies.map((c) => c.from).filter(Boolean).sort();
  const tos = copies.map((c) => c.to).filter(Boolean).sort();
  return {
    rows, from: froms[0] ?? '', to: tos[tos.length - 1] ?? '', savedAt: Math.max(...copies.map((c) => c.savedAt)),
    partial: copies.some((c) => c.total > c.rows.length), copies,
  };
}

export function sourceLine(label: string, m: Merged): string {
  const when = new Date(m.savedAt * 1000);
  const day = (v: string) => parseDay(/^\d{4}-\d{2}$/.test(v) ? `${v}-01` : v);
  const a = day(m.from), b = day(m.to);
  const range = a && b ? (iso(a) === iso(b) ? shortDay(a) : `${shortDay(a)} to ${shortDay(b)}`) : '';
  return `${label}, saved ${shortDay(when)}${range ? `, covers ${range}` : ''}`;
}
export const partialNote = (m: Merged): string => m.partial ? 'Only the first rows of the report were saved, so counts may be lower than the full report.' : '';

/** The place or person named in a typed question, found among these rows. */
export function findValue(question: string, rows: Row[], keys: string[]): { value: string; key: string } | null {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ')} `;
  let best: { value: string; key: string; len: number } | null = null;
  const firsts = new Map<string, Set<string>>();
  for (const key of keys) {
    for (const v of new Set(rows.flatMap((r) => (key === 'rep' || key === 'sm' ? text(r[key]).split(',').map((x) => x.trim()) : [text(r[key])])).filter((s) => s.length >= 3 && s.length <= 50))) {
      const norm = v.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (norm.length >= 3 && q.includes(` ${norm} `) && (!best || norm.length > best.len)) best = { value: v, key, len: norm.length };
      const first = norm.split(' ')[0];
      if (key === 'rep' || key === 'sm') { if (!firsts.has(first)) firsts.set(first, new Set()); firsts.get(first)!.add(v); }
    }
  }
  if (best) return { value: best.value, key: best.key };
  for (const [first, names] of firsts) if (first.length >= 3 && names.size === 1 && q.includes(` ${first} `)) return { value: [...names][0], key: 'rep' };
  return null;
}
/** The name is the whole value, or one of a comma-separated list of names (a customer can have several sales people). */
export const sameName = (a: unknown, b: string): boolean => text(a).split(',').some((x) => x.trim().toLowerCase() === b.toLowerCase()) || text(a).toLowerCase() === b.toLowerCase();

export function rangeFor(p: Period | undefined, today: Date, fallback: Period = 'month'): { from: string; to: string } {
  const [a, b] = periodRange(p ?? fallback, today);
  return { from: iso(a), to: iso(b) };
}

export const toneOf = (value: number, s: Pick<AssistantSettings, 'lo' | 'hi'>, lo?: number) =>
  value < (lo ?? s.lo) ? 'bad' as const : value < s.hi ? 'warn' as const : 'good' as const;
