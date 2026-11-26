import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, DatePicker, Drawer, Empty, Result, Segmented, Select, Table, Tag, Tooltip } from 'antd';
import { LeftOutlined, ReloadOutlined, RightOutlined, SettingOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { MustSellSetup, ProdMissingRow, ProdRow, ProductivityPayload } from '../../api/types';
import { describeError } from '../../api/messages';
import { useCan } from '../../access';
import { asAppError, useSession } from '../../session';
import StillLoading from '../../dashboard/StillLoading';
import ExportButton from '../../ui/ExportButton';
import { fileName } from '../../ui/excel';
import { showDate } from '../../ui/dates';
import {
  LEVER_WORDS, MAX_COMPARE, TRAP_WORDS, changeFor, groupTraps, money, moveTone, num, pct, pickedRows, ratioTone, setMust, toggleCompare, weakestText,
} from './productivityMath';

type Tab = 'reps' | 'compare' | 'traps' | 'missing';
const PATH = '/Report/RepProductivity';

/**
 * Rep Productivity: Sales = Calls x Strike rate x Lines per call x Value per line. Per rep, with last month, the
 * weakest link, a side-by-side comparison, the traps and the products an outlet usually buys but did not lately.
 * Read only (the must-sell list is the one thing saved here). Every part loads on its own, so one failing part
 * never hides the others.
 */
export default function ProductivityPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const [tab, setTab] = useState<Tab>('reps');
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [picked, setPicked] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const canEdit = useCan('create', PATH);
  const thisMonth = dayjs().format('YYYY-MM');
  return (
    <div className="prod">
      <div className="page-title">
        <h2>Rep Productivity</h2>
        <Segmented value={tab} onChange={(v) => setTab(v as Tab)}
          options={[{ value: 'reps', label: 'Reps' }, { value: 'compare', label: 'Compare' }, { value: 'traps', label: 'Traps' }, { value: 'missing', label: 'Missing products' }]} />
        <span className="spacer" />
        {tab === 'missing' && canEdit && <Button icon={<SettingOutlined />} onClick={() => setListOpen(true)}>Must-sell products</Button>}
        {tab !== 'missing' && (
          <>
            <Button icon={<LeftOutlined />} aria-label="Previous month" onClick={() => setMonth((m) => dayjs(`${m}-01`).subtract(1, 'month').format('YYYY-MM'))} />
            <DatePicker picker="month" allowClear={false} value={dayjs(`${month}-01`)} format="MMMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'month')}
              onChange={(v) => { if (v) setMonth(v.format('YYYY-MM')); }} />
            <Button icon={<RightOutlined />} aria-label="Next month" disabled={month >= thisMonth}
              onClick={() => setMonth((m) => dayjs(`${m}-01`).add(1, 'month').format('YYYY-MM'))} />
          </>
        )}
      </div>
      {tab === 'missing'
        ? <Missing classicPath={classicPath} openClassic={openClassic} />
        : <RepsData tab={tab} month={month} picked={picked} setPicked={setPicked} classicPath={classicPath} openClassic={openClassic} />}
      {listOpen && <MustSell onClose={() => setListOpen(false)} />}
    </div>
  );
}

function Problem({ error, retry, classicPath, openClassic }: { error: unknown; retry: () => void; classicPath: string; openClassic: (p: string) => void }) {
  const d = describeError(asAppError(error));
  return <Result status="warning" title={d.title} subTitle={d.text}
    extra={[<Button key="r" icon={<ReloadOutlined />} onClick={retry}>Try again</Button>,
      <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
}

function RepsData({ tab, month, picked, setPicked, classicPath, openClassic }: {
  tab: Tab; month: string; picked: string[]; setPicked: (p: string[]) => void; classicPath: string; openClassic: (p: string) => void;
}) {
  const { api, report, setOffline } = useSession();
  const q = useQuery({
    queryKey: ['report', 'rep_productivity', 'reps', month],
    queryFn: () => api.fetchReport('rep_productivity', { from: month, kind: 'reps', size: 500 }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const p = q.data?.data as ProductivityPayload | undefined;
  if (q.isPending) return <StillLoading />;
  if (q.isError && !p) return <Problem error={q.error} retry={() => void q.refetch()} classicPath={classicPath} openClassic={openClassic} />;
  if (!p) return null;
  return (
    <>
      {p.truncated && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="This month has more orders than the desktop app reads at once, so the figures may be a little low." />}
      <Cards p={p} />
      {tab === 'reps' && <RepsTable p={p} picked={picked} setPicked={setPicked} month={month} />}
      {tab === 'compare' && <Compare p={p} picked={picked} setPicked={setPicked} />}
      {tab === 'traps' && <Traps p={p} />}
    </>
  );
}

function Cards({ p }: { p: ProductivityPayload }) {
  const t = p.totals;
  if (!t) return null;
  const cards: { label: string; value: string; move: string; tone: 'ok' | 'bad' | 'none'; tip: string }[] = [
    { label: 'Sales', value: money(t.sales), move: changeFor(p.change, 'sales'), tone: moveTone(p.change?.sales), tip: 'Order value of all reps in the month.' },
    { label: 'Calls', value: money(t.calls), move: changeFor(p.change, 'calls'), tone: moveTone(p.change?.calls), tip: 'Customer visits (doctor visits and office check-ins are not counted).' },
    { label: 'Strike rate', value: pct(t.strike), move: changeFor(p.change, 'strike'), tone: moveTone(p.change?.strike), tip: 'Calls with an order or sale / all calls.' },
    { label: 'Lines per call', value: num(t.lpc), move: changeFor(p.change, 'lpc'), tone: moveTone(p.change?.lpc), tip: 'Order lines / outlets that ordered that day.' },
    { label: 'Value per line', value: money(t.vpl), move: changeFor(p.change, 'vpl'), tone: moveTone(p.change?.vpl), tip: 'Order value / order lines.' },
  ];
  return (
    <>
      <div className="prod-strip">
        {cards.map((c) => (
          <Tooltip key={c.label} title={c.tip}>
            <div>
              <div className="l">{c.label}</div>
              <div className="v">{c.value}</div>
              <div className={`m ${c.tone}`}>{c.move ? `${c.move} vs last month` : p.previous ? '' : 'No last month to compare'}</div>
            </div>
          </Tooltip>
        ))}
      </div>
      {!!p.what_if?.length && (
        <div className="prod-pull">
          <b>Which lever should a manager pull?</b>{' '}
          {p.what_if.map((w) => <span key={w.key} className="chip">{w.label}: +{money(w.gain)} sales</span>)}
          <span className="muted"> {p.what_if.length > 1 ? 'The larger gain is the better lever to coach first.' : ''}</span>
        </div>
      )}
    </>
  );
}

function RepsTable({ p, picked, setPicked, month }: { p: ProductivityPayload; picked: string[]; setPicked: (v: string[]) => void; month: string }) {
  const [open, setOpen] = useState('');
  if (!p.rows.length) return <Empty description="No calls or orders in this month." />;
  const cell = (r: ProdRow, key: 'strike' | 'lpc' | 'vpl' | 'calls', text: string) => {
    const lv = r.levers.find((l) => l.key === key);
    return <span className={`tone ${ratioTone(lv?.ratio)}`}>{text}</span>;
  };
  return (
    <div className="game-card flush" style={{ marginTop: 12 }}>
      <div className="filters" style={{ padding: '10px 14px' }}>
        <span className="muted">Tick up to {MAX_COMPARE} reps to compare them side by side.</span>
        <span className="spacer" />
        <ExportButton name={fileName('Rep productivity', month)} sheet="Rep productivity"
          load={async () => ({
            columns: [{ key: 'rep', title: 'Rep' }, { key: 'code', title: 'Code' }, { key: 'calls', title: 'Calls' }, { key: 'productive', title: 'Productive calls' },
              { key: 'strike', title: 'Strike rate %' }, { key: 'lines', title: 'Lines' }, { key: 'lpc', title: 'Lines per call' }, { key: 'vpl', title: 'Value per line' },
              { key: 'sales', title: 'Sales' }, { key: 'weakest', title: 'Weakest link' }],
            rows: p.rows.map((r) => ({ ...r, weakest: r.weakest ? LEVER_WORDS[r.weakest].label : '' })) as unknown as Record<string, unknown>[],
          })} />
      </div>
      <Table<ProdRow> size="small" rowKey="code" dataSource={p.rows} pagination={false} scroll={{ x: 'max-content' }}
        rowSelection={{ selectedRowKeys: picked, columnTitle: '', onSelect: (r) => setPicked(toggleCompare(picked, r.code)),
          getCheckboxProps: (r) => ({ disabled: !picked.includes(r.code) && picked.length >= MAX_COMPARE }), hideSelectAll: true }}
        expandable={{ expandedRowKeys: open ? [open] : [], showExpandColumn: false }}
        onRow={(r) => ({ onClick: () => setOpen(open === r.code ? '' : r.code), style: { cursor: 'pointer' } })}
        expandedRowRender={(r) => (
          <div className="prod-detail">
            <div>{weakestText(r)}</div>
            <div className="levers">
              {r.levers.map((l) => (
                <div key={l.key} className={`lever ${ratioTone(l.ratio)}`}>
                  <div className="l">{l.label}</div>
                  <div className="v">{l.key === 'strike' ? pct(l.value) : l.key === 'vpl' || l.key === 'calls' ? money(l.value) : num(l.value)}</div>
                  <div className="t">Team {l.key === 'strike' ? pct(l.team) : l.key === 'vpl' || l.key === 'calls' ? money(l.team) : num(l.team)}</div>
                </div>
              ))}
            </div>
            {r.doctor_calls > 0 && <div className="muted">{r.doctor_calls} doctor calls are not part of these figures.</div>}
          </div>
        )}
        columns={[
          { title: 'Rep', dataIndex: 'rep', render: (v: string, r) => <span>{v} <span className="muted">{r.code}</span></span> },
          { title: 'Calls', dataIndex: 'calls', align: 'right', sorter: (a, b) => a.calls - b.calls, render: (v: number, r) => cell(r, 'calls', money(v)) },
          { title: 'Productive', dataIndex: 'productive', align: 'right', sorter: (a, b) => a.productive - b.productive },
          { title: 'Strike rate', dataIndex: 'strike', align: 'right', sorter: (a, b) => (a.strike ?? -1) - (b.strike ?? -1),
            render: (v: number | null, r) => <span>{cell(r, 'strike', pct(v))} <small className={`m ${moveTone(r.change?.strike)}`}>{changeFor(r.change, 'strike')}</small></span> },
          { title: 'Lines per call', dataIndex: 'lpc', align: 'right', sorter: (a, b) => (a.lpc ?? -1) - (b.lpc ?? -1),
            render: (v: number | null, r) => <span>{cell(r, 'lpc', num(v))} <small className={`m ${moveTone(r.change?.lpc)}`}>{changeFor(r.change, 'lpc')}</small></span> },
          { title: 'Value per line', dataIndex: 'vpl', align: 'right', sorter: (a, b) => (a.vpl ?? -1) - (b.vpl ?? -1),
            render: (v: number | null, r) => <span>{cell(r, 'vpl', money(v))} <small className={`m ${moveTone(r.change?.vpl)}`}>{changeFor(r.change, 'vpl')}</small></span> },
          { title: 'Sales', dataIndex: 'sales', align: 'right', defaultSortOrder: 'descend', sorter: (a, b) => a.sales - b.sales,
            render: (v: number, r) => <span><b>{money(v)}</b> <small className={`m ${moveTone(r.change?.sales)}`}>{changeFor(r.change, 'sales')}</small></span> },
          { title: 'Weakest link', dataIndex: 'weakest', render: (v: ProdRow['weakest']) => (v ? <Tag color="orange">{LEVER_WORDS[v].label}</Tag> : <span className="muted">–</span>) },
        ]} />
    </div>
  );
}

function Compare({ p, picked, setPicked }: { p: ProductivityPayload; picked: string[]; setPicked: (v: string[]) => void }) {
  const rows = useMemo(() => pickedRows(p.rows, picked), [p.rows, picked]);
  return (
    <div className="game-card" style={{ marginTop: 12, padding: 16 }}>
      <div className="filters" style={{ marginBottom: 12 }}>
        <Select mode="multiple" style={{ minWidth: 360, flex: 1 }} placeholder={`Pick 2 to ${MAX_COMPARE} reps`} value={picked} maxCount={MAX_COMPARE}
          options={p.rows.map((r) => ({ value: r.code, label: `${r.rep} (${r.code})` }))} optionFilterProp="label" onChange={(v) => setPicked(v)} />
      </div>
      {rows.length < 2 ? <Empty description="Pick at least two reps to compare their four levers." /> : (
        <table className="prod-compare">
          <thead><tr><th /> {rows.map((r) => <th key={r.code}>{r.rep}</th>)}</tr></thead>
          <tbody>
            {(['calls', 'strike', 'lpc', 'vpl'] as const).map((k) => (
              <tr key={k}>
                <th>{LEVER_WORDS[k].label}</th>
                {rows.map((r) => {
                  const lv = r.levers.find((l) => l.key === k);
                  const text = k === 'strike' ? pct(lv?.value) : k === 'lpc' ? num(lv?.value) : money(lv?.value);
                  return <td key={r.code} className={`tone ${ratioTone(lv?.ratio)}`}>{text}{r.weakest === k && <Tag color="orange" style={{ marginLeft: 6 }}>weakest</Tag>}</td>;
                })}
              </tr>
            ))}
            <tr><th>Sales</th>{rows.map((r) => <td key={r.code}><b>{money(r.sales)}</b></td>)}</tr>
            <tr><th>Coach first</th>{rows.map((r) => <td key={r.code} className="muted">{weakestText(r)}</td>)}</tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function Traps({ p }: { p: ProductivityPayload }) {
  const groups = useMemo(() => groupTraps(p.traps ?? []), [p.traps]);
  if (!groups.length) return <Empty style={{ marginTop: 24 }} description="No traps found. Nobody's numbers look flattering by accident this month." />;
  return (
    <div className="prod-traps">
      {groups.map((g) => (
        <div key={g.code} className="game-card" style={{ padding: 14 }}>
          <b>{g.rep}</b> <span className="muted">{g.code}</span>
          {g.items.map((t) => (
            <div key={t.trap} className="trap">
              <Tag color="red">{TRAP_WORDS[t.trap] ?? t.trap}</Tag> {t.detail}
              <div className="muted">{t.title}</div>
            </div>
          ))}
        </div>
      ))}
      <div className="muted" style={{ gridColumn: '1 / -1' }}>One number never tells the whole story: check strike rate, lines per call and value per line together.</div>
    </div>
  );
}

function Missing({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report, setOffline } = useSession();
  const [search, setSearch] = useState('');
  const [only, setOnly] = useState<'all' | 'must'>('all');
  const q = useQuery({
    queryKey: ['report', 'rep_productivity', 'missing'],
    queryFn: () => api.fetchReport('rep_productivity', { kind: 'missing', size: 500 }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const p = q.data?.data as unknown as ProductivityPayload<ProdMissingRow> | undefined;
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (p?.rows ?? []).filter((r) => (only === 'all' || r.must_missing > 0) && (!s || `${r.customer} ${r.code} ${r.rep}`.toLowerCase().includes(s)));
  }, [p, search, only]);
  if (q.isPending) return <StillLoading />;
  if (q.isError && !p) return <Problem error={q.error} retry={() => void q.refetch()} classicPath={classicPath} openClassic={openClassic} />;
  if (!p) return null;
  return (
    <>
      <div className="muted" style={{ margin: '4px 0 10px' }}>
        Outlets that ordered in the last {(p.usual_days ?? 0) + (p.recent_days ?? 0)} days: products they usually buy (on two or more order days) but did not buy in the last {p.recent_days} days
        {p.must_sell_count ? `, and the must-sell product${p.must_sell_count === 1 ? '' : 's'} (${p.must_sell_count}) they did not buy.` : '. Add must-sell products to also see which outlets miss them.'}
      </div>
      {p.truncated && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="There are more orders than the desktop app reads at once, so some outlets may be missing." />}
      <div className="filters" style={{ marginBottom: 8 }}>
        <input className="prod-search" placeholder="Search outlet, code or rep" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Segmented value={only} onChange={(v) => setOnly(v as 'all' | 'must')} options={[{ value: 'all', label: 'All' }, { value: 'must', label: 'Missing must-sell' }]} />
        <span className="spacer" />
        <ExportButton name={fileName('Missing products', p.window_to ?? '')} sheet="Missing products" disabled={!rows.length}
          load={async () => ({
            columns: [{ key: 'customer', title: 'Outlet' }, { key: 'code', title: 'Code' }, { key: 'rep', title: 'Rep' }, { key: 'last_order', title: 'Last order' },
              { key: 'must_missing', title: 'Must-sell missing' }, { key: 'usual_missing', title: 'Usual missing' }, { key: 'products', title: 'Products' }],
            rows: rows.map((r) => ({ ...r, products: r.items.map((i) => i.name).join(', ') })) as unknown as Record<string, unknown>[],
          })} />
      </div>
      {!rows.length ? <Empty description="Nothing missing for the outlets listed." /> : (
        <div className="game-card flush">
          <Table<ProdMissingRow> size="small" rowKey="code" dataSource={rows} pagination={{ pageSize: 50, showSizeChanger: false }}
            expandable={{ expandedRowRender: (r) => <div>{r.items.map((i) => <Tag key={i.code} color={i.kind === 'must_sell' ? 'red' : 'blue'}>{i.name}</Tag>)}</div> }}
            columns={[
              { title: 'Outlet', dataIndex: 'customer', render: (v: string, r) => <span>{v} <span className="muted">{r.code}</span></span> },
              { title: 'Rep', dataIndex: 'rep' },
              { title: 'Last order', dataIndex: 'last_order', render: (v: string) => String(showDate(v) ?? '') },
              { title: 'Must-sell missing', dataIndex: 'must_missing', align: 'right', sorter: (a, b) => a.must_missing - b.must_missing },
              { title: 'Usual missing', dataIndex: 'usual_missing', align: 'right', sorter: (a, b) => a.usual_missing - b.usual_missing },
              { title: 'Products', dataIndex: 'summary', ellipsis: true },
            ]} />
        </div>
      )}
    </>
  );
}

/** The company's must-sell list: pick products, save. The only thing this page changes. */
function MustSell({ onClose }: { onClose: () => void }) {
  const { api } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['tool', 'productivity_settings'], queryFn: () => api.fetchTool<MustSellSetup>('productivity_settings'), staleTime: 0 });
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const current = codes ?? q.data?.must_sell ?? [];
  const max = q.data?.max ?? 60;
  const save = async () => {
    setSaving(true);
    try {
      await api.saveTool('productivity_settings', { must_sell: setMust(current, max) });
      message.success('Must-sell list saved');
      void qc.invalidateQueries({ queryKey: ['report', 'rep_productivity'] });
      onClose();
    } catch (e) {
      const d = describeError(asAppError(e));
      message.error(d.text);
    } finally { setSaving(false); }
  };
  return (
    <Drawer open title="Must-sell products" width={520} onClose={onClose} destroyOnClose
      extra={<Button type="primary" loading={saving} disabled={q.isPending || q.isError} onClick={() => void save()}>Save</Button>}>
      {q.isError ? <Alert type="error" showIcon message="The list could not be loaded." description="Try again in a moment." /> : (
        <>
          <p className="muted">The products every outlet should stock. Outlets that did not buy them in the last 30 days appear under Missing products. Up to {max}.</p>
          <Select mode="multiple" style={{ width: '100%' }} loading={q.isPending} value={current} maxCount={max} placeholder="Search products"
            options={(q.data?.products ?? []).map((p) => ({ value: p.code, label: `${p.name} (${p.code})` }))} optionFilterProp="label" onChange={(v) => setCodes(v)} />
        </>
      )}
    </Drawer>
  );
}
