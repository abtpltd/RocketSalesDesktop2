// A person's own dashboard view, kept on this computer (and in the settings file, so it survives a new installer):
// which charts and headline cards show, in which order, each chart's view (type, top N, sort, by week...), and the
// days filter. Only items the person's role already sees can be shown; a saved item the role no longer has is skipped,
// and a new item the role gains appears at the end.
import { PAIR_VIEWS, SERIES_VIEWS, type DashFilter, type ViewState } from './views';

export interface Arrange { order: string[]; hidden: string[] }
export interface DashView { v: 1; charts: Arrange; cards: Arrange; views: Record<string, ViewState>; days?: DashFilter['days'] }
export const EMPTY_VIEW: DashView = { v: 1, charts: { order: [], hidden: [] }, cards: { order: [], hidden: [] }, views: {} };

export const viewKey = (company: string, email: string, kind: string) =>
  `dash-view|${company.toLowerCase()}|${email.toLowerCase()}|${kind}`;

const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');
const arrangeOk = (a: unknown): a is Arrange => !!a && typeof a === 'object' && strings((a as Arrange).order) && strings((a as Arrange).hidden);
const VIEWS = new Set<string>([...PAIR_VIEWS, ...SERIES_VIEWS].map((x) => x.value));
const viewOk = (v: unknown): v is ViewState => {
  const x = v as ViewState;
  return !!x && typeof x === 'object' && VIEWS.has(x.view) && typeof x.top === 'number' && (x.sort === 'value' || x.sort === 'name')
    && typeof x.byWeek === 'boolean' && typeof x.running === 'boolean' && strings(x.hidden)
    && (x.pick === undefined || strings(x.pick))
    && [x.values, x.avg, x.prior].every((b) => b === undefined || typeof b === 'boolean') && (x.colors === undefined || typeof x.colors === 'string');
};

/** A stored view, checked piece by piece: anything damaged falls back to the default for that piece. */
export function parseView(raw: unknown): DashView {
  const x = raw as Partial<DashView> | null;
  if (!x || typeof x !== 'object' || x.v !== 1) return EMPTY_VIEW;
  const views: Record<string, ViewState> = {};
  for (const [k, v] of Object.entries(x.views ?? {})) if (viewOk(v)) views[k] = v;
  return {
    v: 1, views,
    charts: arrangeOk(x.charts) ? x.charts : EMPTY_VIEW.charts,
    cards: arrangeOk(x.cards) ? x.cards : EMPTY_VIEW.cards,
    days: x.days === 'month' || x.days === 'last7' ? x.days : undefined,
  };
}

/** The items to show: the role's items in the saved order (new ones last, in their usual place order), minus hidden. */
export function arranged(allowed: string[], a: Arrange): string[] {
  const known = a.order.filter((k) => allowed.includes(k));
  const rest = allowed.filter((k) => !known.includes(k));
  return [...known, ...rest].filter((k) => !a.hidden.includes(k));
}

/** The full list for the customise panel: every allowed item in the current order, with whether it shows. */
export function panelList(allowed: string[], a: Arrange): { key: string; shown: boolean }[] {
  const known = a.order.filter((k) => allowed.includes(k));
  return [...known, ...allowed.filter((k) => !known.includes(k))].map((key) => ({ key, shown: !a.hidden.includes(key) }));
}

/** A chart's saved view only when it suits the chart (a pairs chart cannot take a series view and back). */
export function savedViewFor(v: ViewState | undefined, pairs: boolean): ViewState | undefined {
  if (!v) return undefined;
  const fits = (pairs ? PAIR_VIEWS : SERIES_VIEWS).some((x) => x.value === v.view);
  return fits ? v : undefined;
}

export const sameView = (a: DashView, b: DashView) => JSON.stringify(a) === JSON.stringify(b);
