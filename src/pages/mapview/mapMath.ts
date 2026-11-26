// Map View figures, without Leaflet (tested in node). The server sends one row per customer / doctor; everything
// here adds them up per HQ, area and sales rep while the person drills in and out.

export interface MapPayload {
  report: 'map_view'; title: string; kind: 'customers' | 'doctors'; fields: string[]; points: MapRow[];
  targets: Record<string, number>; rep_sales: Record<string, number>; month: string; today: string; from: string; to: string;
}
/** code, name, hq, area, rep, lat, lng, order value, orders, visits, last visit (yyyy-mm-dd or '') */
export type MapRow = [string, string, string, string, string, number | null, number | null, number, number, number, string];

export interface Point { code: string; name: string; hq: string; area: string; rep: string; lat: number | null; lng: number | null;
  value: number; orders: number; visits: number; last: string; days: number | null }
export type Level = 'hq' | 'area' | 'rep';
export const LEVELS: Level[] = ['hq', 'area', 'rep'];
export const LEVEL_WORD: Record<Level, string> = { hq: 'HQ', area: 'Area', rep: 'Sales rep' };
export type Measure = 'value' | 'visits' | 'coverage' | 'target' | 'stale';
export const STALE_DAYS = 30;
export const NONE = '(not set)';

const dayNo = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1) / 86400000; };

export function toPoints(p: MapPayload): Point[] {
  const today = dayNo(p.today);
  return p.points.map((r) => ({ code: r[0], name: r[1], hq: r[2] || NONE, area: r[3] || NONE, rep: r[4] || NONE, lat: r[5], lng: r[6],
    value: r[7] || 0, orders: r[8] || 0, visits: r[9] || 0, last: r[10] || '', days: r[10] ? Math.max(0, Math.round(today - dayNo(r[10]))) : null }));
}

/** The drill path so far, e.g. [{level:'hq', name:'Nairobi'}, {level:'area', name:'CBD'}]. */
export type Trail = { level: Level; name: string }[];
export const inTrail = (pt: Point, trail: Trail) => trail.every((t) => pt[t.level] === t.name);
/** The level shown next: one below the last step, or the customers themselves after a sales rep. */
export const nextLevel = (trail: Trail): Level | null => (trail.length >= LEVELS.length ? null : LEVELS[trail.length]);

export const stale = (pt: Point) => pt.days === null || pt.days > STALE_DAYS;

export interface Group {
  name: string; count: number; located: number; value: number; orders: number; visits: number; visited: number; stale: number;
  lat: number | null; lng: number | null; target: number | null; sales: number | null;
}

/** Each rep counts toward the group (at this level) holding most of their customers, so targets are not counted twice. */
function repHomes(points: Point[], level: Level): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const pt of points) {
    const m = counts.get(pt.rep) ?? new Map<string, number>();
    m.set(pt[level], (m.get(pt[level]) ?? 0) + 1);
    counts.set(pt.rep, m);
  }
  const home = new Map<string, string>();
  for (const [rep, m] of counts) home.set(rep, [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  return home;
}

export function groups(points: Point[], level: Level, targets: Record<string, number> = {}, repSales: Record<string, number> = {}): Group[] {
  const by = new Map<string, Group & { sLat: number; sLng: number }>();
  for (const pt of points) {
    const k = pt[level];
    const g = by.get(k) ?? { name: k, count: 0, located: 0, value: 0, orders: 0, visits: 0, visited: 0, stale: 0, lat: null, lng: null, target: null, sales: null, sLat: 0, sLng: 0 };
    g.count++; g.value += pt.value; g.orders += pt.orders; g.visits += pt.visits;
    if (pt.visits > 0) g.visited++;
    if (stale(pt)) g.stale++;
    if (pt.lat !== null && pt.lng !== null) { g.located++; g.sLat += pt.lat; g.sLng += pt.lng; }
    by.set(k, g);
  }
  const homes = repHomes(points, level);
  for (const [rep, home] of homes) {
    const g = by.get(home);
    if (!g || !(rep in targets)) continue;
    g.target = (g.target ?? 0) + targets[rep];
    g.sales = (g.sales ?? 0) + (repSales[rep] ?? 0);
  }
  return [...by.values()].map(({ sLat, sLng, ...g }) => ({ ...g, lat: g.located ? sLat / g.located : null, lng: g.located ? sLng / g.located : null }));
}

export const coverage = (g: { count: number; visited: number }) => (g.count ? (g.visited / g.count) * 100 : 0);
export const targetPct = (g: { target: number | null; sales: number | null }) => (g.target ? ((g.sales ?? 0) / g.target) * 100 : null);

export function measureOf(g: Group, m: Measure): number {
  switch (m) {
    case 'value': return g.value;
    case 'visits': return g.visits;
    case 'coverage': return coverage(g);
    case 'target': return targetPct(g) ?? -1;
    default: return g.stale;
  }
}

/** Colour of a group: target % when there is a target (value / target), else how many customers were visited. */
export function tone(g: Group, m: Measure): 'ok' | 'mid' | 'low' | 'none' {
  if (m === 'stale') return g.count && g.stale / g.count > 0.3 ? 'low' : g.stale ? 'mid' : 'ok';
  const t = targetPct(g);
  if ((m === 'value' || m === 'target') && t !== null) return t >= 100 ? 'ok' : t >= 80 ? 'mid' : 'low';
  if (m === 'target') return 'none';
  const c = coverage(g);
  return c >= 80 ? 'ok' : c >= 60 ? 'mid' : 'low';
}

/** Colour of one customer / doctor pin by days since the last visit. */
export const pinTone = (pt: Point): 'ok' | 'mid' | 'low' => (pt.days === null || pt.days > STALE_DAYS ? 'low' : pt.days > 14 ? 'mid' : 'ok');

export function totals(points: Point[], targets: Record<string, number>, repSales: Record<string, number>) {
  const reps = new Set(points.map((p) => p.rep));
  const target = [...reps].reduce((a, r) => a + (targets[r] ?? 0), 0);
  const sales = [...reps].reduce((a, r) => a + (repSales[r] ?? 0), 0);
  return {
    count: points.length, located: points.filter((p) => p.lat !== null).length,
    value: points.reduce((a, p) => a + p.value, 0), visits: points.reduce((a, p) => a + p.visits, 0),
    visited: points.filter((p) => p.visits > 0).length, stale: points.filter(stale).length,
    targetPct: target ? (sales / target) * 100 : null,
  };
}

export const short = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e4 ? `${Math.round(v / 1e3)}K` : Math.round(v).toLocaleString());

/** The tag check: one record's current tag and where each visit in the range was made. */
export interface TagVisit { date: string; rep: string; start: string; end: string; at: [number, number] | null; away_m: number | null; recorded_m: number | null; within: boolean }
export interface TagPayload {
  report: 'tag_visits'; title: string; kind: 'customers' | 'doctors'; from: string; to: string;
  record: { code: string; name: string; tag: [number, number] | null; tagged_by: string; verified: boolean; requests: number; history: number; pending: string };
  visits: TagVisit[]; verdict: 'no_tag' | 'no_visits' | 'far' | 'some_far' | 'ok'; typical_m: number | null; far: number;
}
/** A visit more than this far from the tag is shown as away from it. */
export const FAR_M = 200;
export const metres = (m: number | null) => (m === null ? 'no location' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
export function verdictText(t: Pick<TagPayload, 'verdict' | 'far' | 'visits'>): { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string } {
  const placed = t.visits.filter((v) => v.away_m !== null).length;
  switch (t.verdict) {
    case 'ok': return { tone: 'ok', text: placed === 1 ? 'The visit was made close to the tag.' : `All ${placed} visits were made close to the tag.` };
    case 'some_far': return { tone: 'warn', text: `${t.far} of ${placed} visits were made more than ${FAR_M} m from the tag.` };
    case 'far': return { tone: 'bad', text: `${t.far} of ${placed} visits were made more than ${FAR_M} m from the tag. The tag may be wrong.` };
    case 'no_visits': return { tone: 'info', text: 'No visit with a location in this date range, so the tag cannot be compared.' };
    default: return { tone: 'info', text: 'This record has no location tag.' };
  }
}
