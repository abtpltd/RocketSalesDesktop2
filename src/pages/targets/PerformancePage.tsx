import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Empty, Result, Segmented, Select } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { describeError } from '../../api/messages';
import { asAppError, useSession } from '../../session';
import StillLoading from '../../dashboard/StillLoading';
import MoreMenu from '../../ui/MoreMenu';
import ExportButton from '../../ui/ExportButton';
import { fileName } from '../../ui/excel';
import ReportTable from '../ReportTable';
import { heatKpis, initials, short, toHeat, whole } from './targetsMath';

type Kind = 'orders' | 'visits' | 'sales';
const WORDS: Record<Kind, { total: string; zero: string; unit: (v: number) => string }> = {
  orders: { total: 'Order value', zero: 'Days with no orders', unit: short },
  visits: { total: 'Visits', zero: 'Days with no visits', unit: (v) => whole(v) },
  sales: { total: 'Sales value', zero: 'Days with no sales', unit: short },
};
interface Payload { columns: { key: string; title: string }[]; rows: Record<string, unknown>[]; managers: string[]; rep: string; kind: Kind; from: string; to: string }

/**
 * Performance Report: orders, visits or van sales per sales person and day, as a heat map with totals and a small
 * trend per person. The same figures as the web page (read only); "Table" shows the web's own layout.
 */
export default function PerformancePage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report, setOffline } = useSession();
  const [kind, setKind] = useState<Kind>('orders');
  const [manager, setManager] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [dayjs().subtract(6, 'day'), dayjs()]);
  const [view, setView] = useState<'heat' | 'table'>('heat');
  const from = range[0].format('YYYY-MM-DD'), to = range[1].format('YYYY-MM-DD');
  const q = useQuery({
    queryKey: ['report', 'performance', kind, manager, from, to],
    queryFn: () => api.fetchReport('performance', { from, to, kind, rep: manager, size: 500 }),
    placeholderData: keepPreviousData, enabled: view === 'heat',
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const p = q.data?.data as unknown as Payload | undefined;
  const heat = useMemo(() => (p ? toHeat(p.columns, p.rows) : null), [p]);
  const k = useMemo(() => (heat ? heatKpis(heat) : null), [heat]);

  if (view === 'table') {
    return (
      <>
        <div className="filters"><Segmented value={view} onChange={(v) => setView(v as 'heat' | 'table')} options={[{ value: 'heat', label: 'Heat map' }, { value: 'table', label: 'Table' }]} /></div>
        <ReportTable name="performance" noun="days" classicPath={classicPath} openClassic={openClassic} />
      </>
    );
  }
  if (q.isPending) return <StillLoading />;
  if (q.isError && !p) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  if (!p || !heat || !k) return null;
  const w = WORDS[kind];
  const dayText = (d: string) => { const [dd, mm, yy] = d.split('-'); const x = dayjs(`${yy}-${mm}-${dd}`); return x.isValid() ? x.format('D MMM') : d; };
  const shade = (v: number) => (v ? `color-mix(in srgb, var(--brand) ${Math.round(14 + 80 * v / Math.max(1, heat.max))}%, var(--card))` : 'var(--grid)');
  const order = heat.reps.map((_, i) => i).sort((a, b) => heat.repTotals[b] - heat.repTotals[a]);

  return (
    <div className="game">
      <div className="page-title">
        <h2>Performance Report</h2>
        <Segmented value={kind} onChange={(v) => setKind(v as Kind)} options={[{ value: 'orders', label: 'Orders' }, { value: 'visits', label: 'Visits' }, { value: 'sales', label: 'Sales' }]} />
        <span className="spacer" />
        <Select allowClear placeholder="All managers" style={{ minWidth: 200 }} value={manager || undefined}
          options={p.managers.map((m) => ({ value: m, label: m }))} onChange={(v) => setManager(v ?? '')} />
        <DatePicker.RangePicker allowClear={false} format="D MMM YYYY" value={range} onChange={(v) => { if (v && v[0] && v[1]) setRange([v[0], v[1]]); }} />
        <Segmented value={view} onChange={(v) => setView(v as 'heat' | 'table')} options={[{ value: 'heat', label: 'Heat map' }, { value: 'table', label: 'Table' }]} />
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <MoreMenu items={[{ key: 'classic', label: 'Open in classic window', onClick: () => openClassic(classicPath) }]} />
      </div>
      {range[1].diff(range[0], 'day') > 31 && <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Choose about a month or less, as on the web page." />}
      <div className="game-strip">
        <div><div className="l">{w.total}</div><div className="v">{w.unit(k.total)}<small>{heat.days.length} days</small></div></div>
        <div><div className="l">Best day</div><div className="v">{k.bestDay >= 0 ? dayText(heat.days[k.bestDay]) : '–'}<small>{k.bestDay >= 0 ? w.unit(heat.dayTotals[k.bestDay]) : ''}</small></div></div>
        <div><div className="l">Top sales person</div><div className="v">{k.top >= 0 && heat.repTotals[k.top] ? heat.reps[k.top] : '–'}<small>{k.top >= 0 && heat.repTotals[k.top] ? w.unit(heat.repTotals[k.top]) : ''}</small></div></div>
        <div><div className="l">Active every day</div><div className="v">{k.everyDay.length}<small>{k.everyDay.slice(0, 2).join(', ')}</small></div></div>
        <div><div className="l">{w.zero}</div><div className="v">{k.zero}<small>person-days</small></div></div>
      </div>
      <div className="filters">
        <span className="spacer" />
        <ExportButton name={fileName('Performance Report', kind, from, to)} sheet="Performance" disabled={!heat.reps.length}
          load={async () => ({
            columns: [{ key: 'rep', title: 'Sales person' }, ...heat.days.map((d, j) => ({ key: `d${j}`, title: d })), { key: 'total', title: 'Total' }],
            rows: order.map((i) => ({ rep: heat.reps[i], ...Object.fromEntries(heat.cells[i].map((v, j) => [`d${j}`, v])), total: heat.repTotals[i] })),
          })} />
      </div>
      {!heat.reps.length ? <Empty description="No sales people for this choice." /> : (
        <div className="game-card" style={{ padding: 8, overflowX: 'auto' }}>
          <table className="tg-table tg-heat">
            <thead><tr><th>Sales person</th>{heat.days.map((d) => <th key={d} style={{ textAlign: 'center' }}>{dayText(d)}</th>)}<th className="n">Total</th><th style={{ width: 110 }}>Trend</th></tr></thead>
            <tbody>
              {order.map((i) => {
                const row = heat.cells[i];
                const top = Math.max(1, ...row);
                return (
                  <tr key={heat.reps[i]}>
                    <td><span className="avs" style={{ display: 'inline-grid', marginRight: 8 }}>{initials(heat.reps[i])}</span>{heat.reps[i]}</td>
                    {row.map((v, j) => (
                      <td key={j} className="tg-cell" title={`${heat.reps[i]}, ${dayText(heat.days[j])}: ${whole(v)}`}
                        style={{ background: shade(v), color: v > heat.max * 0.6 ? '#fff' : undefined }}>{v ? w.unit(v) : '–'}</td>
                    ))}
                    <td className="n"><b>{whole(heat.repTotals[i])}</b></td>
                    <td><svg width={100} height={24} aria-hidden><polyline fill="none" stroke="var(--brand)" strokeWidth={2}
                      points={row.map((v, j) => `${(j / Math.max(1, row.length - 1)) * 96 + 2},${22 - (v / top) * 20}`).join(' ')} /></svg></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td><b>All</b></td>{heat.dayTotals.map((v, j) => <td key={j} style={{ textAlign: 'center' }}><b>{w.unit(v)}</b></td>)}<td className="n"><b>{whole(k.total)}</b></td><td /></tr></tfoot>
          </table>
          <div className="mx-legend" style={{ padding: '8px 12px' }}>Less <i style={{ opacity: 0.25 }} /><i style={{ opacity: 0.55 }} /><i /> More
            <span style={{ marginLeft: 14 }}>{kind === 'visits' ? 'Number of visits' : kind === 'orders' ? 'Order total without VAT' : 'Van-sales invoice total without VAT'}, as on the web. Up to 31 days.</span></div>
        </div>
      )}
    </div>
  );
}
