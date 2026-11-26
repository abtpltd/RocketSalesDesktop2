import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Empty, Result, Select } from 'antd';
import { LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { describeError } from '../../api/messages';
import { asAppError, useSession } from '../../session';
import StillLoading from '../../dashboard/StillLoading';
import MoreMenu from '../../ui/MoreMenu';
import ExportButton from '../../ui/ExportButton';
import { fileName } from '../../ui/excel';
import ReportTable from '../ReportTable';
import { STATUS_LABEL, STATUS_TONE, dayReached, initials, neededPerDay, rankRows, short, tone, whole, type AchieveRow, type Status } from './targetsMath';

const MEDAL = ['#d4a017', '#8d99a6', '#b8723d'];
interface Payload {
  title: string; rows: (AchieveRow & Record<string, unknown>)[]; users: { code: string; name: string }[];
  totals?: { target: number; sales: number; projected: number; counts: Record<Status, number> };
  month_days?: number; days_gone?: number;
}

/** Day by day: the rep's sales line against the target and an even pace. */
function DayLine({ daily, target, days }: { daily: number[]; target: number; days: number }) {
  const W = 320, H = 130;
  const top = Math.max(target, daily[daily.length - 1] ?? 0, 1) * 1.08;
  const x = (d: number) => (d / Math.max(1, days)) * W;
  const y = (v: number) => H - (v / top) * H;
  const pts = daily.map((v, i) => `${x(i + 1)},${y(v)}`).join(' ');
  return (
    <svg className="tg-line" viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label="Sales to date against the target">
      {target > 0 && <line x1={0} x2={W} y1={y(target)} y2={y(target)} stroke="var(--warn)" strokeDasharray="5 4" />}
      {target > 0 && <line x1={0} x2={W} y1={H} y2={y(target)} stroke="var(--brand-l)" strokeWidth={2} />}
      {daily.length > 0 && <polyline points={`0,${H} ${pts}`} fill="none" stroke="var(--brand)" strokeWidth={2.5} />}
      <text x={0} y={H + 13} fontSize={11} fill="var(--mute)">Day 1</text>
      <text x={W} y={H + 13} fontSize={11} fill="var(--mute)" textAnchor="end">Day {days}</text>
    </svg>
  );
}

/**
 * Target Vs Sales: the month's target and sales per app user (orders, as on the web), ranked by % achieved, with the
 * projection to month end and each person's day-by-day line. Read only. An older server sends only the plain table,
 * which is then shown as before.
 */
export default function TargetVsSalesPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report, setOffline } = useSession();
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [rep, setRep] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['report', 'target_vs_sales', month, rep],
    queryFn: () => api.fetchReport('target_vs_sales', { from: month, rep, size: 500 }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const p = q.data?.data as unknown as Payload | undefined;
  const ranked = useMemo(() => (p?.totals ? rankRows(p.rows) : []), [p]);
  const sel = ranked.find((r) => r.rep === picked) ?? ranked[0];
  const selCode = p?.users.find((u) => u.name === sel?.rep)?.code ?? '';
  // last 3 months of the chosen person: three small reads of the same report, only for that person
  const past = useQueries({
    queries: [1, 2, 3].map((k) => {
      const m = dayjs(`${month}-01`).subtract(k, 'month').format('YYYY-MM');
      return { queryKey: ['report', 'target_vs_sales', m, selCode], enabled: !!selCode && !!p?.totals,
        queryFn: () => api.fetchReport('target_vs_sales', { from: m, rep: selCode, size: 5 }), staleTime: 300_000 };
    }),
  });

  if (q.isPending) return <StillLoading />;
  if (q.isError && !p) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  if (!p) return null;
  if (!p.totals) return <ReportTable name="target_vs_sales" noun="sales people" classicPath={classicPath} openClassic={openClassic} />;

  const t = p.totals;
  const days = p.month_days ?? 30, gone = p.days_gone ?? days;
  const past_month = gone >= days, future = gone === 0;
  const behind = ranked.filter((r) => r.status === 'behind' || r.status === 'missed');
  const short_by = behind.reduce((a, r) => a + Math.max(0, r.target_n - r.sales_n), 0);
  const podium = ranked.filter((r) => r.target_n > 0).slice(0, 3);
  const label = dayjs(`${month}-01`).format('MMMM YYYY');
  const go = (k: number) => { setMonth(dayjs(`${month}-01`).add(k, 'month').format('YYYY-MM')); setPicked(null); };
  const reached = sel ? dayReached(sel.daily, sel.target_n) : null;

  return (
    <div className="game">
      <div className="page-title">
        <h2>Target Vs Sales</h2>
        <span className="muted">{ranked.length} sales people</span>
        <span className="spacer" />
        <Button icon={<LeftOutlined />} aria-label="Previous month" onClick={() => go(-1)} />
        <DatePicker picker="month" format="MMMM YYYY" allowClear={false} value={dayjs(`${month}-01`)} onChange={(v) => { if (v) { setMonth(v.format('YYYY-MM')); setPicked(null); } }} />
        <Button icon={<RightOutlined />} aria-label="Next month" onClick={() => go(1)} />
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <MoreMenu items={[{ key: 'classic', label: 'Open in classic window', onClick: () => openClassic(classicPath) }]} />
      </div>
      <div className="game-strip">
        <div><div className="l">Team target</div><div className="v">{short(t.target)}<small>{ranked.length} people</small></div></div>
        <div><div className="l">Sales {past_month ? 'in the month' : 'so far'}</div><div className="v">{short(t.sales)}<small>{t.target ? `${Math.round(t.sales / t.target * 100)}%` : ''}</small></div></div>
        <div><div className="l">{past_month ? 'Month total' : 'Projected month end'}</div><div className="v">{future ? '–' : short(t.projected)}<small className={t.target && t.projected >= t.target ? 'tg-up' : ''}>{t.target && !future ? `${Math.round(t.projected / t.target * 100)}%` : ''}</small></div></div>
        <div><div className="l">Reached / on track</div><div className="v">{(t.counts.ahead ?? 0) + (t.counts.on_track ?? 0)}<small>of {ranked.filter((r) => r.target_n > 0).length}</small></div></div>
        <div><div className="l">{past_month ? 'Missed' : 'Behind'}</div><div className="v">{behind.length}<small>{short_by ? `${short(short_by)} short` : ''}</small></div></div>
      </div>
      <div className="filters">
        <Select showSearch allowClear placeholder="All sales people" style={{ minWidth: 240 }} value={rep || undefined} optionFilterProp="label"
          options={p.users.map((u) => ({ value: u.code, label: `${u.name} (${u.code})` }))} onChange={(v) => { setRep(v ?? ''); setPicked(null); }} />
        <span className="spacer" />
        <ExportButton name={fileName('Target Vs Sales', label)} sheet="Target Vs Sales" disabled={!ranked.length}
          load={async () => ({
            columns: [{ key: 'rank', title: 'Rank' }, { key: 'rep', title: 'App user' }, { key: 'target', title: 'Target' }, { key: 'sales', title: 'Sales' },
              { key: 'pct', title: 'Achieved %' }, { key: 'gap', title: 'Gap' }, { key: 'projected', title: 'Projected month end' }, { key: 'status', title: 'Status' }],
            rows: ranked.map((r, i) => ({ rank: i + 1, rep: r.rep, target: r.target_n, sales: r.sales_n, pct: r.pct ?? '', gap: r.gap, projected: r.projected, status: STATUS_LABEL[r.status] })),
          })} />
      </div>
      {!ranked.length ? <Empty description="No targets or sales for this month." /> : (
        <div className="game-board tg-board">
          <div className="game-card flush">
            {podium.length > 0 && !rep && (
              <div className="podium">
                {[1, 0, 2].filter((i) => podium[i]).map((i) => {
                  const r = podium[i];
                  return (
                    <button key={r.rep} type="button" className={`pod${i === 0 ? ' first' : ''}${sel?.rep === r.rep ? ' sel' : ''}`} onClick={() => setPicked(r.rep)}>
                      <span className="medal" style={{ background: MEDAL[i] }}>{i + 1}</span>
                      <span className="ava" style={{ background: MEDAL[i] }}>{initials(r.rep)}</span>
                      <b>{r.rep}</b>
                      <span className="sc">{r.pct == null ? '–' : `${Math.round(r.pct)}%`}</span>
                      <span className="note">{whole(r.sales_n)} of {whole(r.target_n)}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="tg-head"><span>Rank</span><span /><span>App user</span><span className="n">Target</span><span className="n">Sales</span><span>Achieved</span>
              <span className="n">Gap</span><span className="n">{past_month ? 'Final' : 'Month end'}</span><span>Status</span></div>
            {ranked.map((r, i) => (
              <button key={r.rep} type="button" className={`tg-row${sel?.rep === r.rep ? ' sel' : ''}`} onClick={() => setPicked(r.rep)}>
                <span className="rk">{i + 1}</span>
                <span className="avs">{initials(r.rep)}</span>
                <span className="nm" title={r.rep}>{r.rep}</span>
                <span className="n">{whole(r.target_n)}</span>
                <span className="n">{whole(r.sales_n)}</span>
                <span className="tg-bar"><span className="trk"><span className={tone(r.pct)} style={{ width: `${Math.min(100, r.pct ?? 0)}%` }} /></span><b>{r.pct == null ? '–' : `${Math.round(r.pct)}%`}</b></span>
                <span className={`n ${r.gap >= 0 ? 'tg-up' : 'tg-dn'}`}>{r.target_n ? `${r.gap >= 0 ? '+' : '−'}${whole(Math.abs(r.gap))}` : '–'}</span>
                <span className="n">{r.projected_pct == null ? '–' : `${Math.round(r.projected_pct)}%`}</span>
                <span><span className={`tg-chip ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span></span>
              </button>
            ))}
          </div>
          {sel && (
            <div className="game-card rep-panel tg-side">
              <div className="prof"><span className="ava2">{initials(sel.rep)}</span>
                <div><h3>{sel.rep}</h3><span className="muted">Rank {ranked.indexOf(sel) + 1} of {ranked.length}{sel.pct != null ? ` · ${Math.round(sel.pct)}%` : ''}</span></div></div>
              <h4>Day by day against the target</h4>
              <DayLine daily={sel.daily} target={sel.target_n} days={days} />
              <div className="tg-legend"><span><i style={{ background: 'var(--brand)' }} />Sales to date</span><span><i style={{ background: 'var(--brand-l)' }} />Even pace</span><span><i style={{ background: 'var(--warn)' }} />Target</span></div>
              <h4>What it takes</h4>
              <div className="muted" style={{ fontSize: 13 }}>
                {!sel.target_n ? 'No target is set for this month.'
                  : reached ? `Target reached on day ${reached}.${past_month ? '' : ` At this pace the month ends at about ${short(sel.projected)} (${Math.round(sel.projected_pct ?? 0)}%).`}`
                  : past_month ? `Ended ${whole(sel.target_n - sel.sales_n)} short of the target.`
                  : future ? 'The month has not started.'
                  : `${whole(neededPerDay(sel.target_n, sel.sales_n, days, gone))} a day is needed for the ${days - gone} day(s) left. At this pace: ${Math.round(sel.projected_pct ?? 0)}%.`}
              </div>
              <h4>Last 3 months</h4>
              {past.map((r, i) => {
                const row = (r.data?.data as unknown as Payload | undefined)?.rows?.find((x) => x.rep === sel.rep);
                const m = dayjs(`${month}-01`).subtract(i + 1, 'month').format('MMM');
                const pct = row?.pct ?? null;
                return (
                  <div key={m} className="rep-act"><span>{m}</span>
                    <span className="trk"><span className={tone(pct)} style={{ width: `${Math.min(100, pct ?? 0)}%` }} /></span>
                    <b>{r.isFetching ? '…' : pct == null ? '–' : `${Math.round(pct)}%`}</b></div>
                );
              }).reverse()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
