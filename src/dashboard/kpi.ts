import type { DashboardPayload, KpiData, MapLike } from '../api/types';

export const COUNT_CODES = ['AC', 'AO', 'DCA', 'PCA', 'ADS', 'AI', 'CC', 'MC'] as const;
export const CHART_CODES = ['CV', 'DV', 'T10D', 'SWV', 'OTS', 'T10C', 'T10SR', 'T10P', 'HQO', 'CCWO', 'T10RCV',
  'CRWO', 'HQV'] as const;

export const COUNT_LABELS: Record<string, string> = {
  AC: 'Average calls per day', AO: 'Average orders per day', DCA: 'Doctor calls average', PCA: 'Product calls average',
  ADS: 'Average daily sales', AI: 'Average invoices per day', CC: 'Call coverage %', MC: 'Missed calls',
};

export const CHART_TITLES: Record<string, string> = {
  CV: 'Customer visits per day', DV: 'Doctor visits per day', T10D: 'Top 10 doctors by visits',
  SWV: 'Visits by speciality', OTS: 'Orders per day', T10C: 'Top 10 customers', T10SR: 'Top 10 sales reps',
  T10P: 'Top 10 products', HQO: 'Orders by headquarter', CCWO: 'Orders by customer category',
  T10RCV: 'Top 10 reps by visits', CRWO: 'Orders by region', HQV: 'Visits by headquarter',
};

/** The web page sends maps as JSON text. Returns [] for anything unreadable. Nested objects are summed. */
export function toPairs(map: MapLike): [string, number][] {
  let value: unknown = map;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const out: [string, number][] = [];
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof raw === 'number' ? raw
      : typeof raw === 'string' ? Number(raw)
      : raw && typeof raw === 'object' ? Object.values(raw as Record<string, unknown>).reduce<number>((a, v) => a + (Number(v) || 0), 0)
      : NaN;
    if (Number.isFinite(n)) out.push([key, n]);
  }
  return out;
}

export function sortedByDay(pairs: [string, number][]): [string, number][] {
  return [...pairs].sort((a, b) => (Number(a[0]) || 0) - (Number(b[0]) || 0));
}

export function sortedByValue(pairs: [string, number][]): [string, number][] {
  return [...pairs].sort((a, b) => b[1] - a[1]);
}

const named = (list: [string, number][] | undefined, names: Record<string, string> | undefined): [string, number][] =>
  (list ?? []).map(([code, n]) => [names?.[code] ?? code, Number(n) || 0]);

export type ChartKind = 'line' | 'bar' | 'hbar' | 'pie';
export interface ChartSpec { code: string; title: string; kind: ChartKind; pairs: [string, number][] }

export function chartSpec(code: string, d: KpiData): ChartSpec {
  const title = CHART_TITLES[code] ?? code;
  switch (code) {
    case 'CV': return { code, title, kind: 'line', pairs: sortedByDay(toPairs(d.visitDta)) };
    case 'DV': return { code, title, kind: 'line', pairs: sortedByDay(toPairs(d.doctorVisitDta)) };
    case 'OTS': return { code, title, kind: 'line', pairs: sortedByDay(toPairs(d.orderDta)) };
    case 'T10D': return { code, title, kind: 'hbar', pairs: named(d.top10Doctor, d.doctorCodeName) };
    case 'T10C': return { code, title, kind: 'hbar', pairs: named(d.top10Customer, d.customerCodeName) };
    case 'T10P': return { code, title, kind: 'hbar', pairs: named(d.top10Product, d.productCodeName) };
    case 'T10SR': return { code, title, kind: 'hbar', pairs: named(d.top10RepAmt, undefined) };
    case 'T10RCV': return { code, title, kind: 'hbar', pairs: named(d.top10RepVisit, undefined) };
    case 'HQO': return { code, title, kind: 'bar', pairs: sortedByValue(toPairs(d.hqAmt)) };
    case 'HQV': return { code, title, kind: 'bar', pairs: sortedByValue(toPairs(d.hqVisits)) };
    case 'SWV': return { code, title, kind: 'pie', pairs: sortedByValue(toPairs(d.specialityDta)) };
    case 'CCWO': return { code, title, kind: 'pie', pairs: sortedByValue(toPairs(d.customerCatOrderDta)) };
    case 'CRWO': return { code, title, kind: 'pie', pairs: sortedByValue(toPairs(d.regionOrderDta)) };
    default: return { code, title, kind: 'bar', pairs: [] };
  }
}

/**
 * Which cards and charts to show, the same way the web page decides (KPIDash16Jul.js):
 * admin  -> count cards and charts both come from the company's chart list;
 * others -> count cards from the role's card list, charts from the role's KPI list.
 */
export function visibleItems(p: DashboardPayload, isAdmin: boolean) {
  const kpis = p.layout.active_kpis;
  const countSource = isAdmin ? kpis : p.layout.count_cards;
  return {
    counts: COUNT_CODES.filter((c) => countSource.includes(c)),
    charts: CHART_CODES.filter((c) => kpis.includes(c)),
  };
}

export function countValue(d: KpiData, code: string): string {
  const v = d[code];
  return v === undefined || v === null || v === '' ? '-' : String(v);
}
