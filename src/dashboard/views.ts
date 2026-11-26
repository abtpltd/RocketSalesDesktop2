// Ways to look at the same dashboard data: another chart type, top N, sorting, by week, running total, or a table.
import type { ChartOpts, KasSpec, PairKind, SeriesMode, SeriesPart } from './KasChart';

export type PairView = 'hbar' | 'bar' | 'doughnut' | 'treemap' | 'table' | 'pie' | 'rose' | 'lollipop' | 'funnel' | 'radar' | 'sunburst';
export type SeriesView = 'column' | 'line' | 'stacked' | 'table' | SeriesMode;
/** pick: names chosen one by one (rankings); when set, only those show and top is not used. Older saved views have none. */
export interface ViewState {
  view: string; top: number; sort: 'value' | 'name'; byWeek: boolean; running: boolean; hidden: string[]; pick?: string[];
  /** numbers on the chart, an average line, last period dotted behind, a colour set (older saved views have none) */
  values?: boolean; avg?: boolean; prior?: boolean; colors?: string;
}
/** Rankings longer than this open on the top 15 (the rest add up into "Others"), so the bars stay readable. */
export const LONG_RANKING = 20;

export const PAIR_VIEWS: { value: PairView; label: string; more?: boolean }[] = [
  { value: 'hbar', label: 'Bars' }, { value: 'bar', label: 'Columns' }, { value: 'doughnut', label: 'Doughnut' },
  { value: 'treemap', label: 'Treemap' }, { value: 'table', label: 'Table' },
  { value: 'pie', label: 'Pie', more: true }, { value: 'rose', label: 'Rose (radius shows the value)', more: true },
  { value: 'lollipop', label: 'Lollipop', more: true }, { value: 'funnel', label: 'Funnel', more: true },
  { value: 'radar', label: 'Radar', more: true }, { value: 'sunburst', label: 'Sunburst (rings)', more: true }];
export const SERIES_VIEWS: { value: SeriesView; label: string; more?: boolean }[] = [
  { value: 'column', label: 'Columns' }, { value: 'line', label: 'Line' }, { value: 'stacked', label: 'Stacked' }, { value: 'table', label: 'Table' },
  { value: 'area', label: 'Area', more: true }, { value: 'stackedarea', label: 'Stacked area', more: true }, { value: 'smooth', label: 'Smooth line', more: true },
  { value: 'step', label: 'Step line', more: true }, { value: 'percent', label: '100% stacked (shares)', more: true }, { value: 'heat', label: 'Heatmap (busy days)', more: true }];
const MODES: string[] = ['area', 'stackedarea', 'smooth', 'step', 'percent', 'heat'];
const withOpts = (v: ViewState) => { const o = optsOf(v); return Object.keys(o).length ? { opts: o } : {}; };
/** The extras of a view that the chart itself draws. */
export const optsOf = (v: ViewState): ChartOpts => ({ ...(v.values ? { values: true } : {}), ...(v.avg ? { avg: true } : {}), ...(v.colors && v.colors !== 'brand' ? { colors: v.colors } : {}) });

export const isPairs = (s: KasSpec): s is Extract<KasSpec, { pairs: [string, number][] }> => 'pairs' in s;

export function startView(s: KasSpec): ViewState {
  return { view: isPairs(s) ? (s.kind === 'pie' ? 'doughnut' : s.kind) : s.kind === 'line' ? 'line' : 'column', top: isPairs(s) && s.pairs.length > LONG_RANKING ? 15 : 0, sort: 'value', byWeek: false, running: false, hidden: [] };
}

/** The series of any time spec, as named lists of values. */
export function seriesOf(s: KasSpec): { labels: string[]; series: SeriesPart[] } {
  if ('series' in s) return { labels: s.labels, series: s.series };
  if ('values' in s) return { labels: s.labels, series: [{ name: s.title, values: s.values, ...(s.prior ? { prior: s.prior } : {}) }] };
  return { labels: s.pairs.map((p) => p[0]), series: [{ name: s.title, values: s.pairs.map((p) => p[1]) }] };
}

/** Days 1-7, 8-14, ... added up into weeks (empty days stay out of the sum; a week with no days at all stays empty). */
export function byWeek(labels: string[], values: (number | null)[]): { labels: string[]; values: (number | null)[] } {
  const out: { labels: string[]; values: (number | null)[] } = { labels: [], values: [] };
  for (let i = 0; i < labels.length; i += 7) {
    const part = values.slice(i, i + 7);
    const known = part.filter((v): v is number => v !== null && v !== undefined);
    out.labels.push(`${labels[i]}-${labels[Math.min(i + 6, labels.length - 1)]}`);
    out.values.push(known.length ? known.reduce((a, b) => a + b, 0) : null);
  }
  return out;
}

export function running(values: (number | null)[]): (number | null)[] {
  let sum = 0;
  return values.map((v) => (v === null || v === undefined ? null : (sum += v)));
}

export function shapePairs(pairs: [string, number][], v: ViewState): [string, number][] {
  const sorted = [...pairs].sort((a, b) => (v.sort === 'name' ? a[0].localeCompare(b[0]) : b[1] - a[1]));
  if (v.pick?.length) return sorted.filter((p) => v.pick!.includes(p[0]));
  if (!v.top || sorted.length <= v.top) return sorted;
  const kept = sorted.slice(0, v.top);
  const rest = sorted.slice(v.top).reduce((a, p) => a + p[1], 0);
  return rest ? [...kept, [`Others (${sorted.length - v.top})`, rest]] : kept;
}

/** The chart to draw for this view (null: show the table). */
export function shape(s: KasSpec, v: ViewState): KasSpec | null {
  if (v.view === 'table') return null;
  if (isPairs(s)) return { kind: v.view as PairKind, title: s.title, pairs: shapePairs(s.pairs, v), ...withOpts(v) };
  let { labels, series } = seriesOf(s);
  const s0Labels = labels;
  series = series.filter((x) => !v.hidden.includes(x.name));
  if (v.byWeek) {
    const w = series.map((x) => byWeek(labels, x.values));
    labels = w[0]?.labels ?? labels;
    series = series.map((x, i) => ({ name: x.name, values: w[i].values, ...(x.prior ? { prior: byWeek(s0Labels, x.prior).values } : {}) }));
  }
  if (v.running) series = series.map((x) => ({ name: x.name, values: running(x.values), ...(x.prior ? { prior: running(x.prior) } : {}) }));
  const mode = MODES.includes(v.view) ? (v.view as SeriesMode) : undefined;
  // last period drawn dotted behind, for the views where that reads clearly
  const drawsPrior = !!v.prior && (v.view === 'column' || v.view === 'line' || v.view === 'area' || v.view === 'smooth' || v.view === 'step');
  const behind: SeriesPart[] = drawsPrior ? series.filter((x) => x.prior).map((x) => ({ name: `${x.name} (last month)`, values: x.prior!, dashed: true })) : [];
  let main: SeriesPart[] = series.map((x) => ({ name: x.name, values: x.values }));
  if (mode === 'percent') {
    // each day shown as the share of that day's total
    main = main.map((x) => ({ name: x.name, values: x.values.map((val, i) => {
      const t = series.reduce((a, y) => a + (y.values[i] ?? 0), 0);
      return val === null || val === undefined || !t ? null : Math.round(((val / t) * 1000)) / 10;
    }) }));
  }
  if (series.length === 1 && !mode && !behind.length && v.view !== 'stacked') {
    return { kind: v.view === 'line' ? 'line' : 'column', title: s.title, labels, values: series[0].values, ...withOpts(v) };
  }
  return { kind: 'multi', title: s.title, labels, series: [...main, ...behind], ...(v.view === 'stacked' ? { stacked: true } : {}),
    ...(v.view === 'line' ? { lines: true } : {}), ...(mode ? { mode } : {}), ...withOpts(v) } as KasSpec;
}

/** Rows for the table view and for Copy data. */
export function tableOf(s: KasSpec, v: ViewState): { columns: string[]; rows: (string | number)[][] } {
  if (isPairs(s)) {
    const pairs = shapePairs(s.pairs, v);
    const total = pairs.reduce((a, p) => a + p[1], 0);
    return { columns: ['Name', 'Value', 'Share'], rows: pairs.map(([n, x]) => [n, x, total ? `${((x / total) * 100).toFixed(1)}%` : '']) };
  }
  const shaped = shape(s, { ...v, view: 'column', prior: false })!;
  const { labels, series } = seriesOf(shaped);
  return { columns: ['', ...series.map((x) => x.name)], rows: labels.map((l, i) => [l, ...series.map((x) => x.values[i] ?? '')]) };
}

export const tsv = (t: { columns: string[]; rows: (string | number)[][] }) =>
  [t.columns, ...t.rows].map((r) => r.map((c) => String(c).replace(/[\t\n]/g, ' ')).join('\t')).join('\n');

/** The dashboard filter bar: which days of the month, and a name to look for in the top lists. */
export interface DashFilter { days: 'month' | 'last7' | 'custom'; from?: number; to?: number; find: string }
export const NO_FILTER: DashFilter = { days: 'month', find: '' };

/** The days (1-31) the filter keeps, given how far the month has run (`upTo`). */
export function dayRange(f: DashFilter, upTo: number): [number, number] {
  if (f.days === 'last7') return [Math.max(1, upTo - 6), upTo];
  if (f.days === 'custom' && f.from && f.to && f.from <= f.to) return [f.from, f.to];
  return [1, 31];
}

/** The chart data the filter leaves: day charts keep the chosen days, top lists keep names containing the text. */
export function filterSpec(s: KasSpec, f: DashFilter, upTo: number): KasSpec {
  if (isPairs(s)) {
    const q = f.find.trim().toLowerCase();
    return q ? { ...s, pairs: s.pairs.filter(([n]) => n.toLowerCase().includes(q)) } : s;
  }
  const [a, b] = dayRange(f, upTo);
  if (a === 1 && b === 31) return s;
  const keep = s.labels.map((l, i) => [i, Number(/^\d+/.exec(l)?.[0])] as const).filter(([, d]) => d >= a && d <= b).map(([i]) => i);
  if (!keep.length) return s; // labels that are not days: leave the chart as it is
  const pick = <T,>(xs: T[]) => keep.map((i) => xs[i]);
  if ('series' in s) return { ...s, labels: pick(s.labels), series: s.series.map((x) => ({ ...x, values: pick(x.values), ...(x.prior ? { prior: pick(x.prior) } : {}) })) };
  return { ...s, labels: pick(s.labels), values: pick(s.values), ...(s.prior ? { prior: pick(s.prior) } : {}) };
}
