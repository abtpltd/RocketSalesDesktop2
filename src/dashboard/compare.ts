// "vs last month": this month so far against the same days of last month.
import { parseMap } from './kas';
import { monthOf } from './drillMap';

export interface Change { now: number; before: number; pct: number | null }
export interface MonthCompare { prevMonth: string; days: number; visits: Change; doctors: Change; orders: Change }

const sumTo = (m: Record<string, unknown>, upTo: number) => {
  let t = 0;
  for (let d = 1; d <= upTo; d += 1) t += Number(m[String(d)]) || 0;
  return t;
};
const change = (now: number, before: number): Change => ({ now, before, pct: before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null });

/** The day of the month the figures run to: today for this month, the last day for an earlier month. */
export function daysSoFar(month: string | undefined, today: string | undefined): number {
  const [y, m] = monthOf(month, today);
  const [ty, tm] = monthOf(today, today);
  const last = new Date(y, m, 0).getDate();
  if (y === ty && m === tm) return Math.min(last, Number(String(today ?? '').slice(8, 10)) || last);
  return last;
}

/** Null when last month is not known (older server, or no figures), so nothing is shown rather than a wrong figure. */
export function compareMonths(cur: { visitDta?: unknown; doctorVisitDta?: unknown; orderDta?: unknown } | undefined,
  prev: { month?: string; visitDta?: unknown; doctorVisitDta?: unknown; orderDta?: unknown } | undefined,
  month: string | undefined, today: string | undefined): MonthCompare | null {
  if (!cur || !prev || !prev.month) return null;
  try {
    const days = daysSoFar(month, today);
    const [py, pm] = monthOf(prev.month);
    const prevDays = Math.min(days, new Date(py, pm, 0).getDate());
    const f = (x: unknown) => parseMap(x as Parameters<typeof parseMap>[0]);
    const out = {
      prevMonth: prev.month, days,
      visits: change(sumTo(f(cur.visitDta), days), sumTo(f(prev.visitDta), prevDays)),
      doctors: change(sumTo(f(cur.doctorVisitDta), days), sumTo(f(prev.doctorVisitDta), prevDays)),
      orders: change(sumTo(f(cur.orderDta), days), sumTo(f(prev.orderDta), prevDays)),
    };
    return out.visits.before + out.doctors.before + out.orders.before > 0 ? out : null;
  } catch {
    return null;
  }
}

/** Last month's daily figures lined up with this month's day labels (day 1 under day 1), or null when last month is not known.
 *  Days last month did not have stay empty. */
export function priorLines(prev: { month?: string; visitDta?: unknown; doctorVisitDta?: unknown; orderDta?: unknown } | undefined,
  labels: string[]): { customer: (number | null)[]; doctor: (number | null)[]; order: (number | null)[] } | null {
  if (!prev || !prev.month) return null;
  try {
    const [py, pm] = monthOf(prev.month);
    const prevDays = new Date(py, pm, 0).getDate();
    const f = (x: unknown) => parseMap(x as Parameters<typeof parseMap>[0]);
    const line = (m: Record<string, unknown>) => labels.map((l) => {
      const d = Number(l);
      return d >= 1 && d <= prevDays ? Number(m[String(d)]) || 0 : null;
    });
    const out = { customer: line(f(prev.visitDta)), doctor: line(f(prev.doctorVisitDta)), order: line(f(prev.orderDta)) };
    return [out.customer, out.doctor, out.order].some((l) => l.some((v) => v)) ? out : null;
  } catch {
    return null;
  }
}
