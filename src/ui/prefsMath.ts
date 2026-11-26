// Per-user page preferences kept on this computer: hidden columns, row height, saved filters.

/** A saved date range: kept relative when it was "today", "this month" or "last 7 days", so a saved filter stays useful. */
export type SavedRange = { mode: 'none' } | { mode: 'today' } | { mode: 'this_month' } | { mode: 'last_7' } | { mode: 'fixed'; from: string; to: string };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };

export function encodeRange(from: string, to: string, today: Date = new Date()): SavedRange {
  if (!from || !to) return { mode: 'none' };
  const t = iso(today);
  if (from === t && to === t) return { mode: 'today' };
  const first = iso(new Date(today.getFullYear(), today.getMonth(), 1));
  const last = iso(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  if (from === first && (to === last || to === t)) return { mode: 'this_month' };
  const week = new Date(today); week.setDate(week.getDate() - 6);
  if (from === iso(week) && to === t) return { mode: 'last_7' };
  return { mode: 'fixed', from, to };
}
export function decodeRange(r: SavedRange | undefined, today: Date = new Date()): [string, string] | null {
  if (!r) return null;
  const t = iso(today);
  switch (r.mode) {
    case 'today': return [t, t];
    case 'this_month': return [iso(new Date(today.getFullYear(), today.getMonth(), 1)), iso(new Date(today.getFullYear(), today.getMonth() + 1, 0))];
    case 'last_7': { const w = new Date(today); w.setDate(w.getDate() - 6); return [iso(w), t]; }
    case 'fixed': return /^\d{4}-\d{2}-\d{2}$/.test(r.from) && /^\d{4}-\d{2}-\d{2}$/.test(r.to) && parse(r.from) <= parse(r.to) ? [r.from, r.to] : null;
    default: return null;
  }
}
export const rangeLabel = (r: SavedRange) => ({ none: '', today: 'today', this_month: 'this month', last_7: 'last 7 days', fixed: 'fixed dates' }[r.mode]);

export interface SavedView<F> { name: string; range: SavedRange; filters: F }
export const MAX_VIEWS = 12;
/** Adds or replaces a view by name (case-insensitive), newest first, capped. */
export function putView<F>(views: SavedView<F>[], v: SavedView<F>): SavedView<F>[] {
  const name = v.name.trim().slice(0, 40);
  if (!name) return views;
  return [{ ...v, name }, ...views.filter((x) => x.name.toLowerCase() !== name.toLowerCase())].slice(0, MAX_VIEWS);
}

/** Reads a stored value; anything broken or of the wrong shape gives the fallback, never an error. */
export function readJson<T>(key: string, fallback: T, ok: (v: unknown) => boolean): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as unknown;
    return ok(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}
export function writeJson(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage may be blocked: preferences are optional */ }
}
