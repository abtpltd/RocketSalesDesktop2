// How often each question is asked on this computer, so the most used ones can be offered first.
export type Counts = Record<string, number>;
export const okCounts = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every((n) => typeof n === 'number');
export function bump(c: Counts, q: string): Counts {
  const key = q.trim().slice(0, 120);
  if (!key) return c;
  const next = { ...c, [key]: (c[key] ?? 0) + 1 };
  const keys = Object.keys(next);
  if (keys.length > 60) for (const k of keys.sort((a, b) => next[a] - next[b]).slice(0, keys.length - 60)) delete next[k];
  return next;
}
export const topAsked = (c: Counts, skip: string[] = [], n = 4): string[] =>
  Object.entries(c).filter(([q, k]) => k >= 2 && !skip.includes(q)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([q]) => q);
