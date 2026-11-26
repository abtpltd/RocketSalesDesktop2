// Highlights weak rows in a report from the figures already on screen: nothing extra is asked of the server.
export type Tone = 'bad' | 'warn' | 'good';
export interface ToneConfig { on: boolean; lo: number; hi: number; late: string; /** days since the last visit: amber / red */ stale?: number; bad?: number; /** months to expiry: amber */ expiry?: number }
export const TONE_DEFAULT: ToneConfig = { on: true, lo: 50, hi: 80, late: '09:30' };
export const TONE_REPORTS = new Set(['attendance', 'target_vs_sales', 'target_itemized', 'customer_ageing', 'last_activity', 'expiry', 'visits']);
export interface RowTone { row?: Tone; cells?: Record<string, Tone> }

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Reads 2026-10-05, 05-10-2026 and "05 Oct, 2026"; null when it is not a date. */
export function parseDay(v: unknown): Date | null {
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]*,? (\d{4})$/.exec(s);
  if (m) { const mi = MONTHS.indexOf(m[2].toLowerCase()); return mi < 0 ? null : new Date(+m[3], mi, +m[1]); }
  return null;
}

/** "08:05AM(95%)" or "9:40 AM" -> minutes after midnight. */
export function clockMinutes(v: unknown): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(String(v ?? ''));
  if (!m) return null;
  let h = +m[1];
  const ap = (m[3] ?? '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + +m[2];
}
/** The battery share written in a clock cell, e.g. "08:05AM(95%)" -> 95; null when none. */
export function batteryPct(v: unknown): number | null {
  const m = /\((\d{1,3})\s*%\)/.exec(String(v ?? ''));
  return m ? Math.min(100, +m[1]) : null;
}
/** 95% or more is good, 20 to 94 amber, under 20 red. */
export const batteryTone = (pct: number): Tone => (pct >= 95 ? 'good' : pct >= 20 ? 'warn' : 'bad');
/** The time part of a clock cell without the battery bracket. */
export const clockText = (v: unknown): string => String(v ?? '').replace(/\s*\(\d{1,3}\s*%\)\s*$/, '').trim();
const cutoff = (t: string): number => clockMinutes(t) ?? 570;

/** Visits done (customers + doctors) as a share of the visit target; null when there is no target. */
export function attendancePct(r: Record<string, unknown>): number | null {
  const target = num(r.target);
  return target > 0 ? Math.round(((num(r.customer_visits) + num(r.doctor_visits)) / target) * 100) : null;
}
const byShare = (pct: number | null, c: ToneConfig): Tone | undefined => (pct == null ? undefined : pct < c.lo ? 'bad' : pct < c.hi ? 'warn' : 'good');
const daysSince = (d: Date, today: Date) => Math.floor((today.getTime() - d.getTime()) / 86_400_000);

/** Whole months from `today` until an expiry written MM-YYYY, MM/YYYY, DD-MM-YYYY or YYYY-MM-DD (negative: already expired); null if unreadable. */
export function monthsToExpiry(v: unknown, today: Date): number | null {
  const s = String(v ?? '').trim();
  const m = /^(\d{1,2})[-/](\d{4})$/.exec(s);
  let year: number, month: number;
  if (m) { month = +m[1]; year = +m[2]; } else {
    const d = parseDay(s);
    if (!d) return null;
    month = d.getMonth() + 1; year = d.getFullYear();
  }
  if (month < 1 || month > 12) return null;
  return (year - today.getFullYear()) * 12 + (month - 1 - today.getMonth());
}

export function toneFor(report: string, r: Record<string, unknown>, c: ToneConfig, today: Date = new Date()): RowTone {
  if (!c.on) return {};
  switch (report) {
    case 'attendance': {
      const cells: Record<string, Tone> = {};
      const start = clockMinutes(r.start_day);
      if (start != null && start > cutoff(c.late)) cells.start_day = 'bad';
      const ap = String(r.ap ?? '').trim().toUpperCase();
      const day = parseDay(r.date);
      if (day && day.getTime() > today.getTime()) return {}; // a day still to come is not an absence
      if (ap === 'L') return {}; // approved leave
      if (ap.startsWith('A')) return { row: 'bad', cells };
      if (String(r.half_day ?? '').trim()) return { row: 'warn', cells };
      return { row: byShare(attendancePct(r), c), cells };
    }
    case 'target_vs_sales': {
      const t = num(r.target_n ?? r.target);
      return { row: t > 0 ? byShare(Math.round((num(r.sales_n ?? r.sales) / t) * 100), c) : undefined };
    }
    case 'target_itemized': {
      const t = num(r.target_value);
      return { row: t > 0 ? byShare(Math.round((num(r.sales_value) / t) * 100), c) : undefined };
    }
    case 'customer_ageing': {
      const cells: Record<string, Tone> = {};
      if (String(r.d61 ?? '').trim()) cells.d61 = 'bad';
      if (String(r.d60 ?? '').trim()) cells.d60 = 'warn';
      return { cells };
    }
    case 'last_activity': {
      const d = parseDay(r.last_visit);
      if (!d) return { row: String(r.last_visit ?? '').trim() ? undefined : 'bad' };
      const age = daysSince(d, today);
      return { row: age > (c.bad ?? 60) ? 'bad' : age > (c.stale ?? 30) ? 'warn' : undefined };
    }
    case 'expiry': {
      const months = monthsToExpiry(r.expiry, today);
      if (months == null) return {};
      return { row: months < 0 ? 'bad' : months < (c.expiry ?? 3) ? 'warn' : undefined };
    }
    case 'visits':
      return String(r.short_visit ?? '').trim() ? { cells: { short_visit: 'warn' } } : {};
    default: return {};
  }
}
