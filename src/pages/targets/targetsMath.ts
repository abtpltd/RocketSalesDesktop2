// Targets/Achievements helpers (no React, tested in node). The server sends the figures
// (src/desktop_api/reports.py achievement(), itemized_extras(); grids.py open_targets / open_itemized);
// these only arrange them for the screens.
import type { TimelinePayload } from '../../api/types';

export type Status = 'ahead' | 'on_track' | 'behind' | 'missed' | 'no_target';
export const STATUS_LABEL: Record<Status, string> = {
  ahead: 'Ahead', on_track: 'On track', behind: 'Behind', missed: 'Missed', no_target: 'No target',
};
export const STATUS_TONE: Record<Status, 'ok' | 'w' | 'b' | 'g'> = { ahead: 'ok', on_track: 'w', behind: 'b', missed: 'b', no_target: 'g' };

/** Bar colour for a percentage: green at 100%, amber from 80%, red below. */
export function tone(pct: number | null | undefined): 'ok' | 'w' | 'b' {
  if (pct == null) return 'b';
  return pct >= 100 ? 'ok' : pct >= 80 ? 'w' : 'b';
}

export const short = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `${Math.round(v / 1e3)}K`;
  return String(Math.round(v));
};
export const whole = (v: number | null | undefined): string => (v == null ? '–' : Math.round(v).toLocaleString());
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// ---- Target Vs Sales ----
export interface AchieveRow {
  rep: string; target_n: number; sales_n: number; pct: number | null; gap: number; projected: number;
  projected_pct: number | null; status: Status; daily: number[];
}

/** Rows ranked by % achieved (no target last), then by sales. */
export function rankRows(rows: AchieveRow[]): AchieveRow[] {
  return [...rows].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.sales_n - a.sales_n || a.rep.localeCompare(b.rep));
}

/** Amount still needed per remaining day to reach the target (0 when reached or no days left). */
export function neededPerDay(target: number, sales: number, monthDays: number, gone: number): number {
  const left = monthDays - gone;
  return left > 0 && target > sales ? (target - sales) / left : 0;
}

/** The day the cumulative line first reaches the target (1-based), or null. */
export function dayReached(daily: number[], target: number): number | null {
  if (!target) return null;
  const i = daily.findIndex((v) => v >= target);
  return i < 0 ? null : i + 1;
}

// ---- Target Entry grid ----
export interface TargetRow { id: string; amount?: unknown; sales?: unknown; last_amount?: unknown }
type Changes = Record<string, Record<string, unknown>>;
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
export const amountOf = (r: TargetRow, changes: Changes) => num(changes[r.id]?.amount ?? r.amount);

export function targetKpis(rows: TargetRow[], changes: Changes, month: string, today: string) {
  const team = rows.reduce((a, r) => a + amountOf(r, changes), 0);
  const achieved = rows.reduce((a, r) => a + num(r.sales), 0);
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const [ty, tm, td] = today.split('-').map(Number);
  const gone = ty * 12 + tm < y * 12 + m ? 0 : ty * 12 + tm > y * 12 + m ? days : td;
  return {
    team, achieved, pct: team ? Math.round(achieved / team * 100) : null,
    daysLeft: days - gone, perDay: neededPerDay(team, achieved, days, gone),
    without: rows.filter((r) => !amountOf(r, changes)).map((r) => r.id),
  };
}

/** Changes that copy last month's target into rows whose amount differs (rows without one are left alone). */
export function copyLastMonth(rows: TargetRow[], changes: Changes): Changes {
  const next: Changes = { ...changes };
  for (const r of rows) {
    const last = num(r.last_amount);
    if (!last) continue;
    if (last === num(r.amount)) { const row = { ...(next[r.id] ?? {}) }; delete row.amount; if (Object.keys(row).length) next[r.id] = row; else delete next[r.id]; continue; }
    next[r.id] = { ...(next[r.id] ?? {}), amount: last };
  }
  return next;
}

/** Changes that raise every target above 0 by pct (rounded to whole numbers). */
export function raiseBy(rows: TargetRow[], changes: Changes, pct: number): Changes {
  const next: Changes = { ...changes };
  for (const r of rows) {
    const now = amountOf(r, changes);
    if (!now) continue;
    const value = Math.round(now * (1 + pct / 100));
    if (value === num(r.amount)) { const row = { ...(next[r.id] ?? {}) }; delete row.amount; if (Object.keys(row).length) next[r.id] = row; else delete next[r.id]; }
    else next[r.id] = { ...(next[r.id] ?? {}), amount: value };
  }
  return next;
}

// ---- Itemized targets grid ----
export interface ItemRow { id: string; group?: unknown; price?: unknown; qty?: unknown; last_qty?: unknown }
export const qtyOf = (r: ItemRow, changes: Changes) => num(changes[r.id]?.qty ?? r.qty);

/** Value per product group, biggest first; the rest after five go into "Others". */
export function groupSplit(rows: ItemRow[], changes: Changes): { group: string; value: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    const v = qtyOf(r, changes) * num(r.price);
    if (v > 0) by.set(String(r.group || 'Other'), (by.get(String(r.group || 'Other')) ?? 0) + v);
  }
  const list = [...by.entries()].map(([group, value]) => ({ group, value })).sort((a, b) => b.value - a.value);
  if (list.length <= 5) return list;
  const rest = list.slice(4).reduce((a, x) => a + x.value, 0);
  return [...list.slice(0, 4), { group: 'Others', value: rest }];
}

export function copyLastQty(rows: ItemRow[], changes: Changes): Changes {
  const next: Changes = { ...changes };
  for (const r of rows) {
    const last = num(r.last_qty);
    if (last === num(r.qty)) { const row = { ...(next[r.id] ?? {}) }; delete row.qty; if (Object.keys(row).length) next[r.id] = row; else delete next[r.id]; continue; }
    next[r.id] = { ...(next[r.id] ?? {}), qty: last };
  }
  return next;
}

// ---- Performance Report (server rows: one per day, one column per sales person) ----
export interface Heat { reps: string[]; days: string[]; cells: number[][]; repTotals: number[]; dayTotals: number[]; max: number }

export function toHeat(columns: { key: string; title: string }[], rows: Record<string, unknown>[]): Heat {
  const repCols = columns.filter((c) => c.key !== 'date');
  const days = rows.map((r) => String(r.date ?? ''));
  const cells = repCols.map((c) => rows.map((r) => num(String(r[c.key] ?? '0').replace(/,/g, ''))));
  const repTotals = cells.map((row) => row.reduce((a, b) => a + b, 0));
  const dayTotals = days.map((_, j) => cells.reduce((a, row) => a + row[j], 0));
  return { reps: repCols.map((c) => c.title), days, cells, repTotals, dayTotals, max: Math.max(0, ...cells.flat()) };
}

export function heatKpis(h: Heat) {
  const total = h.repTotals.reduce((a, b) => a + b, 0);
  const bestDay = h.dayTotals.length ? h.dayTotals.indexOf(Math.max(...h.dayTotals)) : -1;
  const top = h.repTotals.length ? h.repTotals.indexOf(Math.max(...h.repTotals)) : -1;
  const everyDay = h.reps.filter((_, i) => h.cells[i].length > 0 && h.cells[i].every((v) => v > 0));
  const zero = h.cells.reduce((a, row) => a + row.filter((v) => !v).length, 0);
  return { total, bestDay, top, everyDay, zero };
}

// ---- Visit Performance Report ----
export function timelineKpis(p: TimelinePayload, gapMinutes = 90) {
  let visits = 0, minutes = 0, pctSum = 0, repDays = 0, firstSum = 0, firstN = 0, gaps = 0;
  for (const d of p.timeline.days) for (const r of d.reps) {
    visits += r.count; repDays += 1; pctSum += r.percent;
    if (r.start_m != null) { firstSum += r.start_m; firstN += 1; }
    const timed = r.visits.filter((v) => v.s != null).sort((a, b) => (a.s ?? 0) - (b.s ?? 0));
    for (const v of timed) minutes += v.minutes || 0;
    for (let i = 1; i < timed.length; i++) {
      const prevEnd = timed[i - 1].e ?? timed[i - 1].s ?? 0;
      if ((timed[i].s ?? 0) - prevEnd > gapMinutes) gaps += 1;
    }
  }
  const avgFirst = firstN ? Math.round(firstSum / firstN) : null;
  return {
    visits, minutes, avgVisit: visits ? Math.round(minutes / visits) : 0, workPct: repDays ? Math.round(pctSum / repDays) : 0,
    firstVisit: avgFirst == null ? '–' : `${String(Math.floor(avgFirst / 60)).padStart(2, '0')}:${String(avgFirst % 60).padStart(2, '0')}`,
    gaps, repDays,
  };
}
