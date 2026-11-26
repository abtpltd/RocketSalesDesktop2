import { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Dropdown, Result, Select } from 'antd';
import { AppstoreOutlined, MoreOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { PageHeader } from '../ui/parts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { describeError, syncedAgo } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import KasDashboard from '../dashboard/KasDashboard';
import HomeDashboard from '../dashboard/HomeDashboard';
import { CHART_TITLES, COUNT_LABELS, chartSpec, countValue, sortedByDay, toPairs, visibleItems, type ChartSpec } from '../dashboard/kpi';
import type { KasSpec } from '../dashboard/KasChart';
import DashFilterBar from '../dashboard/DashFilterBar';
import { NO_FILTER, type DashFilter } from '../dashboard/views';
import { ChartCard, KpiStrip, VISITS_TITLE, combineVisits, isEmpty, visitsSpec, type Kpi as KpiItem } from '../dashboard/DashParts';
import { CustomiseDrawer, DashViewProvider, useArranged } from '../dashboard/DashViewContext';
import { EMPTY_VIEW, parseView, sameView, viewKey, type DashView } from '../dashboard/savedView';
import { readJson, writeJson } from '../ui/prefsMath';
import MorningCard from '../assistant/MorningCard';
import { currentQuote } from '../ui/dailyQuote';

const fmt = (n: unknown) => (typeof n === 'number' ? n.toLocaleString() : '-');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 'Oct-2026' -> 'October 2026'; anything else is shown as it came. */
export function monthTitle(m: string): string {
  const x = /^([A-Za-z]{3})-(\d{4})$/.exec(m ?? '');
  const i = x ? MONTHS.findIndex((name) => name.slice(0, 3).toLowerCase() === x[1].toLowerCase()) : -1;
  return i >= 0 ? `${MONTHS[i]} ${x![2]}` : m;
}

function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

// the month chosen stays when the user comes back from a page opened by a click
let lastMonth = '';
let lastFilter: DashFilter = NO_FILTER;

/** The person's saved dashboard view, per company, person and dashboard kind (kept on this computer). */
function useSavedView(key: string | null) {
  const [saved, setSaved] = useState<DashView>(EMPTY_VIEW);
  const [draft, setDraft] = useState<DashView>(EMPTY_VIEW);
  const [version, setVersion] = useState(0); // remounts the charts when the view is reset
  useEffect(() => {
    if (!key) return;
    const v = parseView(readJson<unknown>(key, null, () => true));
    setSaved(v); setDraft(v); setVersion((n) => n + 1);
  }, [key]);
  const save = useCallback(() => { if (key) { writeJson(key, draft); setSaved(draft); } }, [key, draft]);
  const undo = useCallback(() => { setDraft(saved); setVersion((n) => n + 1); }, [saved]);
  const reset = useCallback(() => {
    if (key) { try { localStorage.removeItem(key); } catch { /* optional */ } }
    setSaved(EMPTY_VIEW); setDraft(EMPTY_VIEW); setVersion((n) => n + 1);
  }, [key]);
  return { saved, draft, setDraft, version, save, undo, reset, dirty: !sameView(saved, draft), custom: !sameView(saved, EMPTY_VIEW) };
}

export default function Dashboard({ isAdmin }: { isAdmin: boolean; openClassic?: (path: string) => void }) {
  const { api, report, setOffline, state } = useSession();
  const { message } = AntApp.useApp();
  const now = useNow();
  const [customise, setCustomise] = useState(false);
  const [month, setMonthState] = useState(() => lastMonth);
  const [filter, setFilterState] = useState<DashFilter>(() => lastFilter);
  const setFilter = (f: DashFilter) => { lastFilter = f; setFilterState(f); };
  const setMonth = (m: string) => { lastMonth = m; setMonthState(m); };  // '' = this month, chosen by the server
  const q = useQuery({ queryKey: ['dashboard', month], queryFn: () => api.fetchDashboard(month || undefined), placeholderData: keepPreviousData });

  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  const who = state.status === 'in' ? state.info : null;
  const kind = q.data?.data.kind;
  const sv = useSavedView(who && kind ? viewKey(who.company.domain, who.user.email, kind) : null);
  // a saved days filter (this month / last 7 days) applies when the person has not picked one since opening
  useEffect(() => { if (sv.saved.days && lastFilter === NO_FILTER) setFilterState({ ...NO_FILTER, days: sv.saved.days }); }, [sv.saved.days]);
  const setFilterAndView = (f: DashFilter) => {
    setFilter(f);
    if (f.days !== 'custom') sv.setDraft({ ...sv.draft, days: f.days === 'month' ? undefined : f.days });
  };

  if (q.isPending) return <StillLoading />;
  if (q.isError && !q.data) {
    const d = describeError(asAppError(q.error));
    return (
      <Result status="warning" title={d.title} subTitle={d.text}
        extra={<Button icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>} />
    );
  }
  const { data: payload, source, saved_at } = q.data!;
  const synced = syncedAgo(saved_at, now);

  return (
    <>
      <PageHeader title={monthTitle(payload.month) || 'Dashboard'} meta={<><span>Dashboard</span><span>{source === 'offline' ? `Saved copy from ${synced}` : `Synced ${synced}`}</span></>}
        actions={<>
          {payload.kind === 'kas' && (payload.months ?? []).length > 0 && (
            <Select size="middle" style={{ width: 130 }} value={month || payload.month} aria-label="Month"
              options={(payload.months ?? []).map((m) => ({ value: m, label: m }))} onChange={(m) => { setMonth(m); if (filter.days === 'custom') setFilter({ ...filter, days: 'month' }); }} />
          )}
          <Button icon={<AppstoreOutlined />} onClick={() => setCustomise(true)}>Customise</Button>
          <Button type={sv.dirty ? 'primary' : 'default'} icon={<SaveOutlined />} disabled={!sv.dirty}
            onClick={() => { sv.save(); void message.success('View saved on this computer'); }}>Save view</Button>
          <Button icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
          <Dropdown trigger={['click']} menu={{ items: [
            { key: 'undo', label: 'Undo changes since last save', disabled: !sv.dirty, onClick: sv.undo },
            { key: 'reset', label: 'Back to the standard view', disabled: !sv.custom && !sv.dirty, onClick: () => { sv.reset(); void message.info('Standard view restored'); } },
          ] }}><Button icon={<MoreOutlined />} aria-label="More view options" /></Dropdown>
        </>} />
      {source === 'offline' && (
        <Alert type="warning" showIcon style={{ marginBottom: 14 }} title="You are working offline"
          description="These figures are the last copy saved on this computer. They update when the connection is back." />
      )}
      {q.isError && source !== 'offline' && (
        <Alert type="error" showIcon style={{ marginBottom: 14 }} title={describeError(asAppError(q.error)).title}
          description={describeError(asAppError(q.error)).text} />
      )}
      {(() => { const q = currentQuote(); return q ? <div className="muted" style={{ marginBottom: 10, fontStyle: 'italic' }}>“{q.text}” <span style={{ fontStyle: 'normal' }}>— {q.author}</span></div> : null; })()}
      <MorningCard />
      {sv.dirty && <Alert type="info" showIcon style={{ marginBottom: 12 }} title="You changed this view. Press Save view to keep it on this computer." />}
      <DashFilterBar filter={filter} onChange={setFilterAndView} month={payload.month} today={payload.today} />
      <DashViewProvider key={sv.version} view={sv.draft} onChange={sv.setDraft}>
        {payload.kind === 'kas' ? (
          <KasDashboard payload={payload} isAdmin={isAdmin} filter={filter} />
        ) : payload.kind === 'home' ? (
          <HomeDashboard payload={payload} filter={filter} />
        ) : (
          <Kpi payload={payload} isAdmin={isAdmin} filter={filter} />
        )}
        <CustomiseDrawer open={customise} onClose={() => setCustomise(false)} />
      </DashViewProvider>
    </>
  );
}

/** A KPI chart in the shared look: daily visits as columns, the order trend as a line, pies as rings. */
function toKas(spec: ChartSpec): KasSpec {
  if (spec.kind === 'line') {
    return { kind: spec.code === 'OTS' ? 'line' : 'column', title: spec.title, labels: spec.pairs.map((p) => p[0]), values: spec.pairs.map((p) => p[1]) };
  }
  return { kind: spec.kind === 'pie' ? 'doughnut' : spec.kind, title: spec.title, pairs: spec.pairs };
}

/** Customer and doctor visits on the same days, as one chart. */
function bothVisits(d: import('../api/types').KpiData): KasSpec {
  const cv = new Map(chartSpec('CV', d).pairs); const dv = new Map(chartSpec('DV', d).pairs);
  const days = [...new Set([...cv.keys(), ...dv.keys()])].sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
  return visitsSpec(days, days.map((k) => cv.get(k) ?? 0), days.map((k) => dv.get(k) ?? 0));
}

function Kpi({ payload, isAdmin, filter }: { payload: import('../api/types').DashboardPayload; isAdmin: boolean; filter: DashFilter }) {
  const d = payload.data;
  const { counts, charts } = visibleItems(payload, isAdmin);
  const daily = (m: Parameters<typeof toPairs>[0]) => sortedByDay(toPairs(m)).map((p) => p[1]);
  const items: KpiItem[] = [
    { key: 'cust', card: 'customers' as const, label: 'Customers', value: fmt(d.customerCount) },
    { key: 'prod', card: 'products' as const, label: 'Products', value: fmt(d.productCount) },
    { key: 'att', card: 'attendance' as const, label: 'Attendance today', value: fmt(d.attendanceCount) },
    { key: 'vis', card: 'visits' as const, label: 'Visits today', value: fmt(d.visitCount), spark: daily(d.visitDta) },
    { key: 'ord', card: 'orders' as const, label: 'Orders today', value: fmt(d.orderCount), spark: daily(d.orderDta) },
    ...counts.map((code) => ({ key: code, label: COUNT_LABELS[code], value: countValue(d, code) })),
  ];
  const cardKeys = useArranged('cards', items.map((k) => ({ key: k.key, label: k.label })));
  const chartKeys = useArranged('charts', combineVisits([...charts]).map((code) => ({ key: code, label: CHART_TITLES[code] ?? VISITS_TITLE })));
  return (
    <>
      <KpiStrip today={payload.today} items={cardKeys.map((k) => items.find((x) => x.key === k)!).filter(Boolean)} />
      <div className="dash-grid">
        {chartKeys.map((code) => {
          const s = code === 'CDV' ? bothVisits(d) : toKas(chartSpec(code, d));
          return <ChartCard key={code} code={code} title={CHART_TITLES[code] ?? VISITS_TITLE} spec={s} empty={isEmpty(s)} emptyText="No data for this month yet" month={payload.month} today={payload.today} filter={filter} />;
        })}
      </div>
    </>
  );
}
