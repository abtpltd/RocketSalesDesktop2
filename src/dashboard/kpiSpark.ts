// Helpers for the KPI strip's day-by-day line: where the best and the lowest day are, and how a day is named.

export interface SparkStats { best: number; low: number; first: number; last: number }

/** Index of the best and the lowest day among the days that have a figure (null days are not counted). Null when under two days. */
export function sparkStats(values: (number | null)[]): SparkStats | null {
  const have = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null && Number.isFinite(p[1]));
  if (have.length < 2) return null;
  let best = have[0], low = have[0];
  for (const p of have) { if (p[1] > best[1]) best = p; if (p[1] < low[1]) low = p; }
  return { best: best[0], low: low[0], first: have[0][0], last: have[have.length - 1][0] };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "25 Oct" for day index 24 of the month of `today` (yyyy-mm-dd); "Day 25" when the month is not known. */
export function dayName(index: number, today?: string): string {
  const m = /^\d{4}-(\d{2})-\d{2}/.exec(today ?? '');
  const month = m ? MONTHS[Number(m[1]) - 1] : undefined;
  return month ? `${index + 1} ${month}` : `Day ${index + 1}`;
}

/** A figure with no data behind it: shown as a dash with a hint, never as 0. */
export const noData = (v: unknown) => v === '-' || v === '' || v === null || v === undefined;

export type KpiSize = 'comfortable' | 'compact';
export const okSize = (v: unknown) => v === 'comfortable' || v === 'compact';
