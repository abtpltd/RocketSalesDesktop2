import { useMemo } from 'react';
import type { DashboardPayload } from '../api/types';
import type { DashFilter } from './views';
import { compareMonths, priorLines } from './compare';
import type { KasSpec, PairKind } from './KasChart';
import { chartPairs, type KasData } from './kas';
import { HOME_CARDS, HOME_CHARTS, homeTrend } from './home';
import { ChartCard, KpiStrip, VISITS_TITLE, combineVisits, isEmpty, kpiDelta, visitsSpec, type Kpi } from './DashParts';
import SummaryCards, { CARD_FOR, CARD_LABEL, type CardId } from './SummaryCards';
import { useArranged } from './DashViewContext';

const n = (v: unknown) => (typeof v === 'number' ? v.toLocaleString() : '-');
// the user's order for the headline cards
const HOME_CARD_ORDER: CardId[] = ['customers', 'doctors', 'products', 'attendance', 'visits', 'orders'];

/** The web home page for companies other than kas: the same cards and charts, for this month. */
export default function HomeDashboard({ payload, filter }: { payload: DashboardPayload; filter?: DashFilter }) {
  const d = payload.data as unknown as KasData;
  // days after today have no figures yet: leave them empty instead of drawing a drop to 0
  const lines = useMemo(() => {
    const t = homeTrend(d, payload.today);
    const day = Number((payload.today ?? '').split('-')[2]) || t.labels.length;
    const cut = (vs: number[]) => vs.map((v, i) => (i + 1 > day ? null : v));
    return { labels: t.labels, customer: cut(t.customer), doctor: cut(t.doctor), order: cut(t.order) };
  }, [d, payload.today]);
  const prior = useMemo(() => priorLines(payload.previous, lines.labels), [payload.previous, lines.labels]);
  const sparks: Record<string, (number | null)[]> = { visitCount: lines.customer, orderCount: lines.order };
  const compare = useMemo(() => compareMonths(payload.data as never, payload.previous, payload.month, payload.today), [payload]);
  const kpis: Kpi[] = HOME_CARDS.map(([label, active, inactive]) => ({
    key: label, label, value: n(d[active]), card: CARD_FOR[active as string], delta: kpiDelta(compare, CARD_FOR[active as string]),
    // the web shows "active - inactive"; both figures stay, the inactive one moves under the main figure
    sub: inactive ? `${n(d[inactive])} inactive` : 'today',
    spark: sparks[active as string],
  }));
  const kinds = new Map<string, PairKind | 'line'>(HOME_CHARTS.map(([code, , kind]) => [code, kind as PairKind | 'line']));
  const titles = new Map(HOME_CHARTS.map(([code, title]) => [code, title]));
  const spec = (code: string): KasSpec => {
    const title = titles.get(code) ?? VISITS_TITLE;
    if (code === 'CDV') return visitsSpec(lines.labels, lines.customer, lines.doctor, prior ? { customer: prior.customer, doctor: prior.doctor } : undefined);
    if (code === 'CV') return { kind: 'column', title, labels: lines.labels, values: lines.customer, ...(prior ? { prior: prior.customer } : {}) };
    if (code === 'DV') return { kind: 'column', title, labels: lines.labels, values: lines.doctor, ...(prior ? { prior: prior.doctor } : {}) };
    if (code === 'OTS') return { kind: 'line', title, labels: lines.labels, values: lines.order, ...(prior ? { prior: prior.order } : {}) };
    return { kind: kinds.get(code) as PairKind, title, pairs: chartPairs(code, d) };
  };
  const shownCards = HOME_CARD_ORDER.filter((id) => HOME_CARDS.some(([, active]) => CARD_FOR[active as string] === id));
  // the person's own order and hiding (dashboard "Customise"), within what this dashboard shows
  const cardKeys = useArranged('cards', payload.summary ? shownCards.map((id) => ({ key: id, label: CARD_LABEL[id] })) : kpis.map((k) => ({ key: k.key, label: k.label })));
  const chartCodes = combineVisits(HOME_CHARTS.map(([code]) => code));
  const chartKeys = useArranged('charts', chartCodes.map((code) => ({ key: code, label: spec(code).title })));
  return (
    <>
      {payload.summary ? <SummaryCards ids={cardKeys as CardId[]} summary={payload.summary} orderSpark={lines.order} today={payload.today} compare={compare} />
        : <KpiStrip today={payload.today} items={cardKeys.map((k) => kpis.find((x) => x.key === k)!).filter(Boolean)} />}
      <div className="dash-grid">
        {chartKeys.map((code) => {
          const s = spec(code);
          return <ChartCard key={code} code={code} title={s.title} spec={s} empty={isEmpty(s)} emptyText="No data for this month yet" month={payload.month} today={payload.today} filter={filter} />;
        })}
      </div>
    </>
  );
}
