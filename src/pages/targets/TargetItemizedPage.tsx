import { useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Empty, Result, Segmented, Select } from 'antd';
import { LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { describeError } from '../../api/messages';
import { asAppError, useSession } from '../../session';
import StillLoading from '../../dashboard/StillLoading';
import MoreMenu from '../../ui/MoreMenu';
import ExportButton from '../../ui/ExportButton';
import { fileName } from '../../ui/excel';
import ReportTable from '../ReportTable';
import { short, tone, whole } from './targetsMath';

interface Row { key: string; product: string; target_value_n: number; sales_value_n: number; target_qty_n: number; sales_qty_n: number; pct: number | null }
interface Payload {
  rows: Row[]; users: { code: string; name: string }[]; rep: string;
  totals?: { target_value: number; sales_value: number; pct: number | null };
  unplanned?: { code: string; product: string; qty: number; value: number }[]; unplanned_value?: number;
}
const WORD = { ok: 'Reached', w: 'Close', b: 'Behind' } as const;

/**
 * Target Vs Sales Itemized: one sales person's month, product by product (target from Itemized Targets, sales from
 * orders, as on the web), with the biggest gaps and the products sold without a target. Read only. An older server
 * sends only the plain table, which is then shown as before.
 */
export default function TargetItemizedPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report, setOffline } = useSession();
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [rep, setRep] = useState('');
  const [by, setBy] = useState<'value' | 'qty'>('value');
  const q = useQuery({
    queryKey: ['report', 'target_itemized', month, rep],
    queryFn: () => api.fetchReport('target_itemized', { from: month, rep, size: 500 }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const p = q.data?.data as unknown as Payload | undefined;
  const rows = useMemo(() => {
    const list = [...(p?.rows ?? [])];
    const pctOf = (r: Row) => (by === 'qty' ? (r.target_qty_n ? r.sales_qty_n / r.target_qty_n * 100 : null) : r.pct);
    return list.map((r) => ({ ...r, show: pctOf(r) })).sort((a, b) => (b.show ?? -1) - (a.show ?? -1));
  }, [p, by]);

  if (q.isPending) return <StillLoading />;
  if (q.isError && !p) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  if (!p) return null;
  if (rep && !p.totals) return <ReportTable name="target_itemized" noun="products" classicPath={classicPath} openClassic={openClassic} />;

  const t = p.totals;
  const ahead = rows.filter((r) => (r.show ?? 0) >= 100);
  const behind = rows.filter((r) => r.show == null || r.show < 80);
  const gaps = [...rows].map((r) => ({ name: r.product, gap: by === 'qty' ? r.target_qty_n - r.sales_qty_n : r.target_value_n - r.sales_value_n }))
    .filter((g) => g.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 5);
  const label = dayjs(`${month}-01`).format('MMMM YYYY');
  const repName = p.users.find((u) => u.code === rep)?.name ?? '';
  const go = (k: number) => setMonth(dayjs(`${month}-01`).add(k, 'month').format('YYYY-MM'));

  return (
    <div className="game">
      <div className="page-title">
        <h2>Target Vs Sales Itemized</h2>
        {repName && <span className="muted">{repName}</span>}
        <span className="spacer" />
        <Select showSearch placeholder="Choose a sales person" style={{ minWidth: 240 }} value={rep || undefined} optionFilterProp="label"
          options={p.users.map((u) => ({ value: u.code, label: `${u.name} (${u.code})` }))} onChange={(v) => setRep(v ?? '')} />
        <Button icon={<LeftOutlined />} aria-label="Previous month" onClick={() => go(-1)} />
        <DatePicker picker="month" format="MMMM YYYY" allowClear={false} value={dayjs(`${month}-01`)} onChange={(v) => { if (v) setMonth(v.format('YYYY-MM')); }} />
        <Button icon={<RightOutlined />} aria-label="Next month" onClick={() => go(1)} />
        <Segmented value={by} onChange={(v) => setBy(v as 'value' | 'qty')} options={[{ value: 'value', label: 'Value' }, { value: 'qty', label: 'Quantity' }]} />
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <MoreMenu items={[{ key: 'classic', label: 'Open in classic window', onClick: () => openClassic(classicPath) }]} />
      </div>
      {!rep ? <Empty style={{ marginTop: 60 }} description="Choose a sales person to see their products." /> : !t ? null : (
        <>
          <div className="game-strip">
            <div><div className="l">Target value</div><div className="v">{short(t.target_value)}<small>{rows.length} products</small></div></div>
            <div><div className="l">Sales value</div><div className="v">{short(t.sales_value)}<small>{t.pct == null ? '' : `${Math.round(t.pct)}%`}</small></div></div>
            <div><div className="l">Products reached</div><div className="v">{ahead.length}<small>{ahead.slice(0, 2).map((r) => r.product).join(', ')}</small></div></div>
            <div><div className="l">Products behind</div><div className="v">{behind.length}<small>{gaps[0] ? `biggest gap ${gaps[0].name}` : ''}</small></div></div>
            <div><div className="l">Sold without a target</div><div className="v">{p.unplanned?.length ?? 0}<small>{p.unplanned_value ? `worth ${whole(p.unplanned_value)}` : ''}</small></div></div>
          </div>
          <div className="filters">
            <span className="spacer" />
            <ExportButton name={fileName('Target Vs Sales Itemized', repName, label)} sheet="Itemized" disabled={!rows.length}
              load={async () => ({
                columns: [{ key: 'product', title: 'Product' }, { key: 'tq', title: 'Target qty' }, { key: 'tv', title: 'Target value' },
                  { key: 'sq', title: 'Sales qty' }, { key: 'sv', title: 'Sales value' }, { key: 'pct', title: 'Achieved %' }],
                rows: rows.map((r) => ({ product: r.product, tq: r.target_qty_n, tv: r.target_value_n, sq: r.sales_qty_n, sv: r.sales_value_n, pct: r.show == null ? '' : Math.round(r.show) })),
              })} />
          </div>
          <div className="game-board tg-board">
            <div className="game-card flush">
              {!rows.length ? <Empty style={{ padding: 40 }} description="No itemized target is saved for this person and month." /> : (
                <table className="tg-table">
                  <thead><tr><th>Product</th><th className="n">Target qty</th><th className="n">Target value</th><th className="n">Sales qty</th><th className="n">Sales value</th><th>Achieved</th><th>Status</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td>{r.product}</td><td className="n">{whole(r.target_qty_n)}</td><td className="n">{whole(r.target_value_n)}</td>
                        <td className="n">{whole(r.sales_qty_n)}</td><td className="n">{whole(r.sales_value_n)}</td>
                        <td style={{ minWidth: 150 }}><span className="tg-bar"><span className="trk"><span className={tone(r.show)} style={{ width: `${Math.min(100, r.show ?? 0)}%` }} /></span><b>{r.show == null ? '–' : `${Math.round(r.show)}%`}</b></span></td>
                        <td><span className={`tg-chip ${tone(r.show)}`}>{WORD[tone(r.show)]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td><b>Total</b></td><td /><td className="n"><b>{whole(t.target_value)}</b></td><td /><td className="n"><b>{whole(t.sales_value)}</b></td><td colSpan={2}><b>{t.pct == null ? '' : `${Math.round(t.pct)}%`}</b></td></tr></tfoot>
                </table>
              )}
            </div>
            <div className="game-card rep-panel tg-side">
              <h3>Biggest gaps</h3>
              <div className="muted" style={{ fontSize: 12.5 }}>{by === 'qty' ? 'Quantity' : 'Value'} still to sell this month</div>
              {gaps.length === 0 && <div className="muted" style={{ marginTop: 8 }}>No gaps: every product reached its target.</div>}
              {gaps.map((g) => (
                <div key={g.name} style={{ marginTop: 10 }}>
                  <div className="tg-list" style={{ padding: 0 }}><span>{g.name}</span><b>{whole(g.gap)}</b></div>
                  <span className="trk" style={{ display: 'block', marginTop: 4 }}><span className="b" style={{ width: `${(g.gap / gaps[0].gap) * 100}%` }} /></span>
                </div>
              ))}
              <h4>Sold without a target</h4>
              <div className="muted" style={{ fontSize: 12.5 }}>Worth adding to next month's itemized targets</div>
              {!(p.unplanned ?? []).length && <div className="muted" style={{ marginTop: 6 }}>None.</div>}
              {(p.unplanned ?? []).map((u) => <div key={u.code} className="tg-list"><span>{u.product}</span><b>{whole(u.value)}</b></div>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
