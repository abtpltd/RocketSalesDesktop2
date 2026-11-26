import type { DrillTarget } from '../drill';

const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');
/** 2026-10-03 shown as 03-10-2026. */
export const showDay = (iso: string) => iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3-$2-$1');

/** The dashboard month as [year, month 1-12]; 'Oct-2026', '2026-10', 'October 2026' or a date. Falls back to `today`, then this month. */
export function monthOf(month?: string | null, today?: string | null): [number, number] {
  for (const s of [month, today]) {
    const v = String(s ?? '').trim();
    let m = /^(\d{4})-(\d{1,2})/.exec(v);
    if (m && +m[2] >= 1 && +m[2] <= 12) return [+m[1], +m[2]];
    m = /^([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})$/.exec(v);
    if (m) { const i = MON.indexOf(m[1].toLowerCase()); if (i >= 0) return [+m[2], i + 1]; }
  }
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1];
}
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
const day = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(Math.min(Math.max(d, 1), lastDay(y, m)))}`;
export function monthRange(month?: string | null, today?: string | null): { from: string; to: string } {
  const [y, m] = monthOf(month, today);
  return { from: day(y, m, 1), to: day(y, m, 31) };
}
/** A day label ('7', '07', '07-Oct', '2026-10-07') or a week ('1-7') as a date range; null when it is not one. */
export function daysOf(label: string, month?: string | null, today?: string | null): { from: string; to: string } | null {
  const v = String(label ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return { from: v, to: v };
  const [y, m] = monthOf(month, today);
  const wk = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(v);
  if (wk && +wk[1] >= 1 && +wk[2] >= +wk[1] && +wk[2] <= 31) return { from: day(y, m, +wk[1]), to: day(y, m, +wk[2]) };
  const d = /^(\d{1,2})(?:\D|$)/.exec(v);
  if (d && +d[1] >= 1 && +d[1] <= 31) { const x = day(y, m, +d[1]); return { from: x, to: x }; }
  return null;
}

const VISITS = '/Report/VisitReport';
const ORDERS = '/OrderGrid';
/** Day charts and where a day leads. */
const BY_DAY: Record<string, string> = { CDV: VISITS, CV: VISITS, DV: VISITS, OTS: ORDERS };
/** Ranking charts: the name is searched for in that page over the month. */
const BY_NAME: Record<string, string> = {
  T10C: ORDERS, T10SR: ORDERS, T10P: ORDERS, HQO: ORDERS, CRWO: ORDERS, CCWO: ORDERS,
  T10D: VISITS, T10RCV: VISITS, SWV: VISITS, HQV: VISITS,
};
const PAGE_NAME: Record<string, string> = { [VISITS]: 'Visits', [ORDERS]: 'Orders' };

/** What a click on a chart opens, or null when nothing fits (the click is then ignored). */
export function chartTarget(code: string, name: string, month?: string | null, today?: string | null, find?: string): DrillTarget | null {
  const n = String(name ?? '').trim();
  if (!n || /^Others \(/.test(n)) return null;
  if (BY_DAY[code]) {
    const r = daysOf(n, month, today);
    if (!r) return null;
    const q = String(find ?? '').trim();
    return { path: BY_DAY[code], ...r, ...(q ? { search: q } : {}), label: `${PAGE_NAME[BY_DAY[code]]} ${r.from === r.to ? showDay(r.from) : `${showDay(r.from)} to ${showDay(r.to)}`}${q ? ` for ${q}` : ''}` };
  }
  if (BY_NAME[code]) return { path: BY_NAME[code], ...monthRange(month, today), search: n, label: `${PAGE_NAME[BY_NAME[code]]} for ${n}` };
  return null;
}
export const drillHint = (code: string) => (BY_DAY[code] ? 'Click a day to open its records' : BY_NAME[code] ? 'Click a name to open its records' : undefined);

/** Headline cards and the page each opens. */
export function cardTarget(id: string, today?: string | null): DrillTarget | null {
  const t = daysOf(String(today ?? ''), today, today) ?? (() => { const d = new Date(); const x = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; return { from: x, to: x }; })();
  switch (id) {
    case 'customers': return { path: '/master/Client', label: 'Customers' };
    case 'doctors': return { path: '/master/Doctors', label: 'Doctors' };
    case 'products': return { path: '/master/Product', label: 'Products' };
    case 'attendance': return { path: '/Report/Attendance', ...t, label: 'Attendance today' };
    case 'visits': return { path: VISITS, ...t, label: 'Visits today' };
    case 'orders': return { path: ORDERS, ...t, label: 'Orders today' };
    default: return null;
  }
}
/** A person in a KPI table: their visits over the month. */
export function personTarget(name: string, month?: string | null): DrillTarget | null {
  const n = String(name ?? '').trim();
  return n ? { path: VISITS, ...monthRange(month), search: n, label: `Visits for ${n}` } : null;
}
