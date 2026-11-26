import { useMemo } from 'react';
import type { DashboardPayload } from '../api/types';
import type { DashFilter } from './views';
import { compareMonths, priorLines } from './compare';
import type { KasSpec, PairKind } from './KasChart';
import { KAS_CARDS, KAS_CHARTS, KAS_TABLES, arrange, chartPairs, kasTables, trend, type KasData } from './kas';
import KpiTable from './KpiTable';
import { ChartCard, KpiStrip, VISITS_TITLE, combineVisits, isEmpty, kpiDelta, visitsSpec } from './DashParts';
import SummaryCards, { CARD_FOR, CARD_LABEL, type CardId } from './SummaryCards';
import { useArranged } from './DashViewContext';

const KIND: Record<string, PairKind> = {
  T10D: 'hbar', T10SR: 'hbar', T10C: 'doughnut', T10P: 'doughnut', T10RCV: 'doughnut', SWV: 'doughnut',
  CCWO: 'pie', HQO: 'bar', CRWO: 'bar', HQV: 'treemap',
};
const fmt = (n: unknown) => (n === undefined || n === null || n === '' ? '-' : typeof n === 'number' ? n.toLocaleString() : String(n));

/** The KAS company's dashboard: the same cards, charts and KPI tables as the web page, for the chosen month. */
export default function KasDashboard({ payload, isAdmin, filter }: { payload: DashboardPayload; isAdmin: boolean; filter?: DashFilter }) {
  const d = payload.data as unknown as KasData;
  const { active_kpis: active, count_cards: cardSeq, chart_cards: chartSeq } = payload.layout;
  const lines = useMemo(() => trend(d), [d]);
  const prior = useMemo(() => priorLines(payload.previous, lines.labels), [payload.previous, lines.labels]);
  const tables = useMemo(() => kasTables(d), [d]);
  const cards = arrange(KAS_CARDS.map((c) => c[0]), cardSeq, active, isAdmin);
  const charts = arrange(KAS_CHARTS.map((c) => c[0]), chartSeq, active, isAdmin);
  const shownTables = KAS_TABLES.filter((id) => isAdmin || active.includes(id));

  const spec = (code: string, title: string): KasSpec => {
    if (code === 'CDV') return visitsSpec(lines.labels, lines.customer, lines.doctor, prior ? { customer: prior.customer, doctor: prior.doctor } : undefined);
    if (code === 'CV') return { kind: 'column', title, labels: lines.labels, values: lines.customer, ...(prior ? { prior: prior.customer } : {}) };
    if (code === 'DV') return { kind: 'column', title, labels: lines.labels, values: lines.doctor, ...(prior ? { prior: prior.doctor } : {}) };
    if (code === 'OTS') return { kind: 'line', title, labels: lines.labels, values: lines.order, ...(prior ? { prior: prior.order } : {}) };
    return { kind: KIND[code], title, pairs: chartPairs(code, d) };
  };
  const sparks: Record<string, (number | null)[]> = { VCOUNT: lines.customer, OCOUNT: lines.order };
  const summaryIds = cards.map((id) => CARD_FOR[id]).filter(Boolean) as CardId[];
  const cardKeys = useArranged('cards', payload.summary ? summaryIds.map((id) => ({ key: id, label: CARD_LABEL[id] }))
    : cards.map((id) => ({ key: id, label: KAS_CARDS.find((c) => c[0] === id)?.[1] ?? id })));
  const chartKeys = useArranged('charts', combineVisits(charts).map((code) => ({ key: code, label: KAS_CHARTS.find((c) => c[0] === code)?.[1] ?? VISITS_TITLE })));

  return (
    <>
      {payload.summary
        ? <SummaryCards ids={cardKeys as CardId[]} summary={payload.summary} orderSpark={lines.order} today={payload.today} compare={compareMonths(payload.data as never, payload.previous, payload.month, payload.today)} />
        : <KpiStrip today={payload.today} items={cardKeys.map((id) => {
          const [, label, field] = KAS_CARDS.find((c) => c[0] === id)!;
          return { key: id, label, value: fmt(d[field]), spark: sparks[id], card: CARD_FOR[id],
            delta: CARD_FOR[id] ? kpiDelta(compareMonths(payload.data as never, payload.previous, payload.month, payload.today), CARD_FOR[id]) : null };
        })} />}
      <div className="dash-grid">
        {chartKeys.map((code) => {
          const title = KAS_CHARTS.find((c) => c[0] === code)?.[1] ?? VISITS_TITLE;
          const s = spec(code, title);
          return <ChartCard key={code} code={code} title={title} spec={s} empty={isEmpty(s)} emptyText="No data for this month" month={payload.month} today={payload.today} filter={filter} />;
        })}
      </div>
      {tables.filter((t) => shownTables.includes(t.id as (typeof KAS_TABLES)[number])).map((t) => (
        <KpiTable key={t.id} t={t} month={payload.month} />
      ))}
    </>
  );
}
