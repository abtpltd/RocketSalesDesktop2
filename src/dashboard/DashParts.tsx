import { useDashView } from './DashViewContext';
import { savedViewFor } from './savedView';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { App as AntApp, Button, Checkbox, Dropdown, Input, InputNumber, Modal, Radio, Segmented, Select, Space, Table, Tooltip } from 'antd';
import { AimOutlined, AppstoreOutlined, CopyOutlined, DownloadOutlined, EnvironmentOutlined, CompressOutlined, FullscreenOutlined, IdcardOutlined, MedicineBoxOutlined, PictureOutlined, ShopOutlined, ShoppingOutlined, SlidersOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { useSession } from '../session';
import { fileName } from '../ui/excel';
import { PALETTES } from './KasChart';
import { NO_FILTER, PAIR_VIEWS, SERIES_VIEWS, filterSpec, isPairs, shape, startView, tableOf, tsv, type DashFilter, type ViewState } from './views';
import { daysSoFar } from './compare';
import { useDrill } from '../drill';
import { cardTarget, chartTarget, drillHint } from './drillMap';
import type { CardId } from './SummaryCards';
import { dayName, noData, okSize, sparkStats, type KpiSize } from './kpiSpark';
import { readJson, writeJson } from '../ui/prefsMath';
import type { MonthCompare } from './compare';
import { chartPng, copyImage, copyText, savePng, shareWhatsApp } from './share';
import type { KasSpec } from './KasChart';
import KasChart from './KasChart';

/** One figure in the KPI strip: label, big value, a short line under it and an optional daily sparkline. */
export interface Kpi { key: string; label: string; value: ReactNode; sub?: ReactNode; spark?: (number | null)[]; card?: CardId; delta?: KpiDelta | null }
/** "vs last month, same days": the change in per cent (null when last month had none), with a note for the tooltip. */
export interface KpiDelta { pct: number | null; tip: string }
const CARD_ICON: Record<CardId, ReactNode> = { customers: <ShopOutlined />, doctors: <MedicineBoxOutlined />, products: <AppstoreOutlined />,
  attendance: <IdcardOutlined />, visits: <EnvironmentOutlined />, orders: <ShoppingOutlined /> };
const CARD_TONE: Record<CardId, string> = { customers: 'blue', doctors: 'teal', products: 'violet', attendance: 'green', visits: 'orange', orders: 'rose' };
/** The change of a figure against the same days of last month, from the month comparison (visits count customer and doctor visits). */
export function kpiDelta(c: MonthCompare | null | undefined, card: CardId): KpiDelta | null {
  if (!c) return null;
  const one = card === 'orders' ? c.orders : card === 'visits' ? { now: c.visits.now + c.doctors.now, before: c.visits.before + c.doctors.before } : null;
  if (!one) return null;
  const pct = one.before > 0 ? Math.round(((one.now - one.before) / one.before) * 1000) / 10 : null;
  return { pct, tip: `This month so far: ${one.now.toLocaleString()}. Same days of ${c.prevMonth}: ${one.before.toLocaleString()}.` };
}

/** A tiny line of the month's daily values; no axes, the shape is the point. */
export function Spark({ values, label }: { values: (number | null)[]; label: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null && Number.isFinite(p[1]));
  if (pts.length < 2) return null;
  const w = 140; const h = 34; const max = Math.max(...pts.map((p) => p[1]), 1);
  const lastX = Math.max(values.length - 1, 1);
  const xy = pts.map(([i, v]) => [(i / lastX) * w, h - 2 - (v / max) * (h - 4)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M${xy[0][0].toFixed(1)},${h} L${line.replace(/ /g, ' L')} L${xy[xy.length - 1][0].toFixed(1)},${h} Z`;
  return (
    <svg className="kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${label}, each day`}>
      <path d={area} className="kpi-spark-area" />
      <polyline points={line} className="kpi-spark-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The headline figures as one joined strip, the way the month brief design shows them. */
export function KpiStrip({ items, today }: { items: Kpi[]; today?: string }) {
  const { drill } = useDrill();
  const { state } = useSession();
  const key = `rs:kpi-size:${state.status === 'in' ? `${state.info.company.domain}|${state.info.user.email}` : 'anon'}`.toLowerCase();
  const [size, setSizeRaw] = useState<KpiSize>(() => readJson<KpiSize>(key, 'comfortable', okSize));
  const setSize = (v: KpiSize) => { setSizeRaw(v); writeJson(key, v); };
  if (!items.length) return null;
  return (
    <div className={`kpi-strip${size === 'compact' ? ' compact' : ''}`}>
      <Tooltip title={size === 'compact' ? 'Show larger cards' : 'Show compact cards'}>
        <button type="button" className="kpi-size" aria-label={size === 'compact' ? 'Show larger cards' : 'Show compact cards'}
          onClick={() => setSize(size === 'compact' ? 'comfortable' : 'compact')}>{size === 'compact' ? <FullscreenOutlined /> : <CompressOutlined />}</button>
      </Tooltip>
      <div className="kpi-grid">
        {items.map((k) => (
          <KpiCell key={k.key} k={k} today={today} onOpen={k.card ? (() => { const to = cardTarget(k.card!, today); return to ? () => drill(to) : undefined; })() : undefined} />
        ))}
      </div>
    </div>
  );
}

function KpiCell({ k, onOpen, today }: { k: Kpi; onOpen?: () => void; today?: string }) {
  const none = noData(k.value);
  const tone = k.delta ? (k.delta.pct === null ? 'flat' : k.delta.pct > 0 ? 'up' : k.delta.pct < 0 ? 'down' : 'flat') : '';
  return (
    <div className={`kpi${k.card ? ` tone-${CARD_TONE[k.card]}` : ''}${onOpen ? ' can-open' : ''}`} {...(onOpen ? {
      role: 'button', tabIndex: 0, title: `Open ${k.label.toLowerCase()}`, onClick: onOpen,
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
    } : {})}>
      <div className="kpi-label">{k.card && <span className="kpi-icon" aria-hidden>{CARD_ICON[k.card]}</span>}<span>{k.label}</span></div>
      <div className={`kpi-value${none ? ' none' : ''}`}>{none ? '–' : k.value}</div>
      {none ? <div className="kpi-sub">No data yet</div> : k.sub && <div className="kpi-sub">{k.sub}</div>}
      {k.delta && <div className={`kpi-delta ${tone}`} title={k.delta.tip}><b>{k.delta.pct === null ? 'new' : `${k.delta.pct > 0 ? '▲' : k.delta.pct < 0 ? '▼' : '='} ${Math.abs(k.delta.pct)}%`}</b> vs last month</div>}
      {k.spark && !none && <KpiLine values={k.spark} label={k.label} today={today} />}
    </div>
  );
}

/** The month's daily line, taller: hover a day for its figure; the best day is green and the lowest red. */
function KpiLine({ values, label, today }: { values: (number | null)[]; label: string; today?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const st = sparkStats(values);
  if (!st) return null;
  const w = 200, h = 54, last = Math.max(values.length - 1, 1);
  const max = Math.max(...values.filter((v): v is number => v !== null), 1);
  const at = (i: number) => [(i / last) * w, h - 3 - ((values[i] ?? 0) / max) * (h - 8)] as const;
  const pts = values.map((v, i) => (v === null ? null : at(i))).filter((p): p is readonly [number, number] => p !== null);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M${pts[0][0].toFixed(1)},${h} L${line.replace(/ /g, ' L')} L${pts[pts.length - 1][0].toFixed(1)},${h} Z`;
  const move = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * last);
    setHover(i >= st.first && i <= st.last && values[i] !== null ? i : null);
  };
  const f = (v: number | null) => (v === null ? '' : v.toLocaleString());
  return (
    <div className="kpi-line" onClick={(e) => e.stopPropagation()}>
      <div className="kpi-plot">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${label}, each day`} onMouseMove={move} onMouseLeave={() => setHover(null)}>
        <path d={area} className="kpi-spark-area" />
        <polyline points={line} className="kpi-spark-line" vectorEffect="non-scaling-stroke" />
      </svg>
      {[[st.best, 'best'], [st.low, 'low']].map(([i, c]) => <i key={c as string} className={`kpi-dot ${c}`} style={{ left: `${(Number(i) / last) * 100}%`, top: `${(at(Number(i))[1] / h) * 100}%` }} />)}
      {hover !== null && <><i className="kpi-dot now" style={{ left: `${(hover / last) * 100}%`, top: `${(at(hover)[1] / h) * 100}%` }} />
        <div className="kpi-tip" style={{ left: `${(hover / last) * 100}%` }}>{dayName(hover, today)} · {f(values[hover])}</div></>}
      </div>
      <div className="kpi-extremes"><span><i className="best" />Best {dayName(st.best, today)}, {f(values[st.best])}</span><span><i className="low" />Lowest {dayName(st.low, today)}, {f(values[st.low])}</span></div>
    </div>
  );
}

const SUBS: Record<string, string> = {
  CDV: 'Customers and doctors, day by day',
  CV: 'Customer visits, day by day', DV: 'Doctor visits, day by day',
  T10D: 'Doctors with the most visits', T10C: 'Customers by order value', T10SR: 'Sales reps by order value',
  T10P: 'Products by order value', HQO: 'Order value by HQ', CRWO: 'Order value by customer region',
  CCWO: 'Order value by customer category', T10RCV: 'Reps with the most customer visits', SWV: 'Doctor visits by specialty',
  HQV: 'Visits by HQ',
};

/** "HQ Orders (value)" -> title "HQ Orders", subtitle "Order value by HQ"; unknown charts keep the bracket text as the subtitle. */
export function splitTitle(code: string, title: string): { title: string; sub: string } {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(title);
  // the subtitle says the same thing in full ("Order value by HQ"), so the bracket moves into it
  // the order trend is value on the kas page ("Orders Trend (value)") and the home page's orderDta is the day's order value too (DailyCron)
  if (code === 'OTS') return m ? { title: m[1], sub: `Order ${m[2]}, day by day` } : { title, sub: 'Order value, day by day' };
  if (m) return { title: m[1], sub: SUBS[code] ?? m[2].charAt(0).toUpperCase() + m[2].slice(1) };
  return { title, sub: SUBS[code] ?? '' };
}

/** Daily trends get two columns; everything else one, so the grid packs four across on a wide window. */
export const isWide = (s: KasSpec) => s.kind === 'line' || s.kind === 'column' || s.kind === 'multi' || s.kind === 'treemap'
  || (s.kind === 'bar' && s.pairs.length > 10);

/** Customer and doctor visits share one chart: CV takes the place of both, DV is dropped (when both are shown). */
export const VISITS_TITLE = 'Customer & Doctor Visits';
export function combineVisits(codes: string[]): string[] {
  if (!codes.includes('CV') || !codes.includes('DV')) return codes;
  const first = Math.min(codes.indexOf('CV'), codes.indexOf('DV'));
  return codes.flatMap((c, i) => (c === 'CV' || c === 'DV' ? (i === first ? ['CDV'] : []) : [c]));
}

export function visitsSpec(labels: string[], customer: (number | null)[], doctor: (number | null)[],
  prior?: { customer: (number | null)[]; doctor: (number | null)[] }): KasSpec {
  return { kind: 'multi', title: VISITS_TITLE, labels, series: [{ name: 'Customers', values: customer, ...(prior ? { prior: prior.customer } : {}) },
    { name: 'Doctors', values: doctor, ...(prior ? { prior: prior.doctor } : {}) }] };
}

/** Nothing to draw: no pairs, or no day with a figure. */
export function isEmpty(s: KasSpec): boolean {
  if ('series' in s) return !s.series.some((x) => x.values.some((v) => v));
  if ('values' in s) return !s.values.some((v) => v);
  return s.pairs.length === 0;
}

/** A maximise icon for a dashboard card; opens the content full screen. */
export function MaximiseButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip title="Maximise">
      <Button type="text" size="small" className="max-btn" icon={<FullscreenOutlined />} onClick={onClick} aria-label="Maximise" />
    </Tooltip>
  );
}

/** Full-screen view of a chart or table, with its title. */
export function FullView({ open, onClose, title, sub, extra, children }: {
  open: boolean; onClose: () => void; title: string; sub?: string; extra?: ReactNode; children: ReactNode;
}) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} width="calc(100vw - 48px)" centered destroyOnHidden
      className="full-view" title={<div className="full-view-head"><div><div className="t">{title}</div>{sub && <div className="s">{sub}</div>}</div>{extra}</div>}>
      {children}
    </Modal>
  );
}

export function ChartCard({ code, title, spec: raw, empty: rawEmpty, emptyText, month, today, filter }: {
  code: string; title: string; spec: KasSpec; empty: boolean; emptyText: string;
  /** the dashboard month, for the dates a click opens */
  month?: string; today?: string;
  /** the dashboard filter bar */
  filter?: DashFilter;
}) {
  const { drill } = useDrill();
  const f = filter ?? NO_FILTER;
  const spec = useMemo(() => filterSpec(raw, f, daysSoFar(month, today)), [raw, f, month, today]);
  const filtered = spec !== raw;
  const empty = rawEmpty || (filtered && isPairs(spec) && !spec.pairs.length);
  const hint = drillHint(code);
  const onDrill = hint ? (name: string) => { const to = chartTarget(code, name, month, today, f.find); if (to) drill(to); } : undefined;
  const drillHintText = hint;
  const t = splitTitle(code, title);
  const [big, setBig] = useState(false);
  // the person's saved view of this chart (dashboard "Save view"), when it suits the chart
  const dv = useDashView();
  const [v, setVState] = useState<ViewState>(() => savedViewFor(dv?.view.views[code], isPairs(spec)) ?? startView(spec));
  const setV = (x: ViewState) => { setVState(x); dv?.setChartView(code, x); };
  const shaped = shape(spec, v);
  const pick = onDrill;
  return (
    <section className={`dash-card${isWide(spec) ? ' wide' : ''}`}>
      <header>
        <div><h3>{t.title}</h3>{t.sub && <div className="dash-sub">{t.sub}</div>}</div>
        {!empty && <div className="dash-actions"><ViewPicker spec={spec} v={v} setV={setV} compact />{onDrill && drillHintText && <Tooltip title={drillHintText}><span className="drill-hint"><AimOutlined /></span></Tooltip>}<MaximiseButton onClick={() => setBig(true)} /></div>}
      </header>
      {empty ? <div className="empty-chart">{rawEmpty ? emptyText : `No names matching "${f.find}"`}</div>
        : shaped ? <KasChart spec={{ ...shaped, title: t.title }} onPick={pick} />
        : <ViewTable spec={spec} v={v} onPick={pick} />}
      {big && <BigChart title={t.title} sub={t.sub} spec={spec} v={v} setV={setV} onClose={() => setBig(false)} onPick={pick} drillHint={drillHintText} />}
    </section>
  );
}

/** What a ranking shows: all, the top N (any number), or items picked one by one; for day charts, which series. */
function ChooseItems({ spec, v, setV, onClose }: { spec: KasSpec; v: ViewState; setV: (v: ViewState) => void; onClose: () => void }) {
  const pairs = isPairs(spec);
  const all = pairs ? [...spec.pairs].sort((a, b) => b[1] - a[1]) : ('series' in spec ? spec.series.map((x) => [x.name, x.values.reduce<number>((a, b) => a + (b ?? 0), 0)] as [string, number]) : []);
  const [mode, setMode] = useState<'all' | 'top' | 'pick'>(pairs ? (v.pick?.length ? 'pick' : v.top ? 'top' : 'all') : 'pick');
  const [top, setTop] = useState<number>(v.top || 10);
  const [picked, setPicked] = useState<string[]>(() => (pairs ? v.pick ?? all.slice(0, Math.min(5, all.length)).map((p) => p[0]) : all.map((p) => p[0]).filter((n) => !v.hidden.includes(n))));
  const [find, setFind] = useState('');
  const shown = all.filter(([n]) => !find || n.toLowerCase().includes(find.toLowerCase()));
  const apply = () => {
    if (!pairs) setV({ ...v, hidden: all.map((p) => p[0]).filter((n) => !picked.includes(n)) });
    else if (mode === 'all') setV({ ...v, top: 0, pick: undefined });
    else if (mode === 'top') setV({ ...v, top: Math.max(1, top || 1), pick: undefined });
    else setV({ ...v, top: 0, pick: picked });
    onClose();
  };
  const toggle = (n: string, on: boolean) => setPicked((p) => (on ? [...p, n] : p.filter((x) => x !== n)));
  return (
    <Modal open title={pairs ? 'Choose what to show' : 'Choose the lines to show'} onCancel={onClose} onOk={apply} okText="Show"
      okButtonProps={{ disabled: mode === 'pick' && !picked.length }} width={480}>
      {pairs && (
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <Radio value="all">All {all.length}</Radio>
          <Radio value="top"><Space size={6} wrap>Top <InputNumber size="small" min={1} max={500} value={top} onChange={(n) => { setTop(Number(n) || 1); setMode('top'); }} style={{ width: 72 }} />
            {[5, 10, 15, 20].map((n) => <Button key={n} size="small" type={mode === 'top' && top === n ? 'primary' : 'default'} onClick={() => { setTop(n); setMode('top'); }}>{n}</Button>)}
            <span className="muted">the rest add up as "Others"</span></Space></Radio>
          <Radio value="pick">Only the ones I tick ({picked.length})</Radio>
        </Radio.Group>
      )}
      {(mode === 'pick' || !pairs) && <>
        <Space style={{ marginBottom: 8 }} wrap>
          <Input.Search allowClear size="small" placeholder="Find" value={find} onChange={(e) => setFind(e.target.value)} style={{ width: 200 }} />
          <Button size="small" onClick={() => setPicked((p) => [...new Set([...p, ...shown.map((x) => x[0])])])}>Tick {find ? 'found' : 'all'}</Button>
          <Button size="small" onClick={() => setPicked((p) => p.filter((x) => !shown.some((y) => y[0] === x)))}>Clear {find ? 'found' : 'all'}</Button>
        </Space>
        <div className="pick-list">
          {shown.map(([n, val]) => (
            <label key={n} className="pick-row"><Checkbox checked={picked.includes(n)} onChange={(e) => toggle(n, e.target.checked)} />
              <span className="pick-name">{n}</span><span className="muted">{val.toLocaleString()}</span></label>
          ))}
          {!shown.length && <div className="muted" style={{ padding: 8 }}>Nothing matches.</div>}
        </div>
      </>}
    </Modal>
  );
}

const showLabel = (v: ViewState) => (v.pick?.length ? `${v.pick.length} chosen` : v.top ? `Top ${v.top}` : 'All');

/** View choices: chart type, top N / chosen items and sort for rankings; by day / week, running total and series for days. */
export function ViewPicker({ spec, v, setV, compact }: { spec: KasSpec; v: ViewState; setV: (v: ViewState) => void; compact?: boolean }) {
  const pairs = isPairs(spec);
  const views = pairs ? PAIR_VIEWS : SERIES_VIEWS;
  const core = views.filter((o) => !o.more);
  const more = views.filter((o) => o.more);
  const hasPrior = !pairs && (('series' in spec && spec.series.some((x) => x.prior)) || ('values' in spec && !!spec.prior));
  const tick = (on: boolean | undefined, label: string) => (on ? `✓ ${label}` : label);
  const names = 'series' in spec ? spec.series.map((x) => x.name) : [];
  const [choosing, setChoosing] = useState(false);
  const chooser = choosing && <ChooseItems spec={spec} v={v} setV={setV} onClose={() => setChoosing(false)} />;
  if (compact) {
    return (
      <>
        <Dropdown trigger={['click']} menu={{
          selectable: true, selectedKeys: [v.view, ...(pairs && !v.pick?.length ? [`top${v.top}`] : [])],
          items: [
            { type: 'group', label: 'Show as', children: [...core.map((o) => ({ key: o.value, label: o.label })),
              { key: 'more', label: 'More charts', children: more.map((o) => ({ key: o.value, label: o.label })) }] },
            ...(pairs ? [{ type: 'group' as const, label: `Show (${showLabel(v)})`, children: [
              ...[0, 5, 10, 15].map((n) => ({ key: `top${n}`, label: n ? `Top ${n}` : 'All' })),
              { key: 'choose', label: v.pick?.length ? `Chosen items (${v.pick.length})...` : 'Top N or choose items...' }] }]
              : [{ type: 'group' as const, label: 'Group', children: [{ key: 'day', label: 'By day' }, { key: 'week', label: 'By week' }, { key: 'run', label: v.running ? 'Daily figures' : 'Running total' },
                ...(names.length > 1 ? [{ key: 'choose', label: 'Choose lines...' }] : [])] }]),
            { type: 'group' as const, label: 'Options', children: [
              { key: 'opt:values', label: tick(v.values, 'Show values on the chart') },
              { key: 'opt:avg', label: tick(v.avg, 'Average line') },
              ...(hasPrior ? [{ key: 'opt:prior', label: tick(v.prior, 'Compare with last month') }] : []),
              { key: 'colours', label: 'Colours', children: PALETTES.map((p) => ({ key: `col:${p.id}`, label: tick((v.colors ?? 'brand') === p.id, p.label) })) }] },
          ],
          onClick: ({ key }) => {
            if (key === 'choose') setChoosing(true);
            else if (key === 'more' || key === 'colours') return;
            else if (key.startsWith('opt:')) { const f = key.slice(4) as 'values' | 'avg' | 'prior'; setV({ ...v, [f]: !v[f] }); }
            else if (key.startsWith('col:')) setV({ ...v, colors: key.slice(4) });
            else if (key.startsWith('top')) setV({ ...v, top: Number(key.slice(3)), pick: undefined });
            else if (key === 'day' || key === 'week') setV({ ...v, byWeek: key === 'week' });
            else if (key === 'run') setV({ ...v, running: !v.running });
            else setV({ ...v, view: key });
          },
        }}>
          <Tooltip title="Change the view" placement="left"><Button type="text" size="small" className="max-btn" icon={<SlidersOutlined />} aria-label="Change the view" /></Tooltip>
        </Dropdown>
        {chooser}
      </>
    );
  }
  return (
    <Space wrap size={6} className="view-bar">
      <Segmented size="small" value={core.some((o) => o.value === v.view) ? v.view : undefined} onChange={(x) => setV({ ...v, view: String(x) })} options={core} />
      <Select size="small" placeholder="More charts" style={{ width: 190 }} value={more.some((o) => o.value === v.view) ? v.view : undefined}
        onChange={(x) => setV({ ...v, view: String(x) })} options={more.map((o) => ({ value: o.value, label: o.label }))} />
      <Checkbox checked={!!v.values} onChange={(e) => setV({ ...v, values: e.target.checked })}>Values</Checkbox>
      <Checkbox checked={!!v.avg} onChange={(e) => setV({ ...v, avg: e.target.checked })}>Average line</Checkbox>
      {hasPrior && <Checkbox checked={!!v.prior} onChange={(e) => setV({ ...v, prior: e.target.checked })}>Last month</Checkbox>}
      <Select size="small" style={{ width: 130 }} value={v.colors ?? 'brand'} onChange={(x) => setV({ ...v, colors: x })} options={PALETTES.map((p) => ({ value: p.id, label: p.label }))} aria-label="Colours" />
      {pairs ? <>
        <Button size="small" onClick={() => setChoosing(true)}>Show: {showLabel(v)}</Button>
        {(v.pick?.length || v.top) ? <Button size="small" type="link" onClick={() => setV({ ...v, top: 0, pick: undefined })}>Show all</Button> : null}
        <Segmented size="small" value={v.sort} onChange={(x) => setV({ ...v, sort: x as 'value' | 'name' })} options={[{ value: 'value', label: 'Highest first' }, { value: 'name', label: 'A to Z' }]} />
      </> : <>
        <Segmented size="small" value={v.byWeek ? 'week' : 'day'} onChange={(x) => setV({ ...v, byWeek: x === 'week' })} options={[{ value: 'day', label: 'By day' }, { value: 'week', label: 'By week' }]} />
        <Checkbox checked={v.running} onChange={(e) => setV({ ...v, running: e.target.checked })}>Running total</Checkbox>
        {names.length > 1 && names.map((n) => (
          <Checkbox key={n} checked={!v.hidden.includes(n)} disabled={!v.hidden.includes(n) && names.length - v.hidden.length === 1}
            onChange={(e) => setV({ ...v, hidden: e.target.checked ? v.hidden.filter((x) => x !== n) : [...v.hidden, n] })}>{n}</Checkbox>
        ))}
      </>}
      {chooser}
    </Space>
  );
}

/** The table view of a chart. */
export function ViewTable({ spec, v, onPick, height }: { spec: KasSpec; v: ViewState; onPick?: (name: string, series: string) => void; height?: number }) {
  const t = tableOf(spec, v);
  return (
    <Table size="small" className="view-table" pagination={false} scroll={{ y: height ?? 260 }} rowKey={(r) => String(r[0])}
      dataSource={t.rows} onRow={onPick ? (r) => ({ onClick: () => onPick(String(r[0]), ''), style: { cursor: 'pointer' } }) : undefined}
      columns={t.columns.map((c, i) => ({ title: c || (isPairs(spec) ? '' : v.byWeek ? 'Days' : 'Day'), key: String(i), align: i ? 'right' as const : undefined,
        sorter: (a: (string | number)[], b: (string | number)[]) => (typeof a[i] === 'number' && typeof b[i] === 'number' ? (a[i] as number) - (b[i] as number) : String(a[i]).localeCompare(String(b[i]))),
        render: (_: unknown, r: (string | number)[]) => (typeof r[i] === 'number' ? (r[i] as number).toLocaleString(undefined, { maximumFractionDigits: 1 }) : r[i]) }))} />
  );
}

/** Full screen: every view choice, and copy / save / WhatsApp. */
function BigChart({ title, sub, spec, v, setV, onClose, onPick, drillHint }: {
  title: string; sub?: string; spec: KasSpec; v: ViewState; setV: (v: ViewState) => void; onClose: () => void;
  onPick?: (name: string, series: string) => void; drillHint?: string;
}) {
  const shaped = shape(spec, v);
  const chart = useRef<{ getDataURL: (o: object) => string } | null>(null);
  return (
    <FullView open onClose={onClose} title={title} sub={sub}
      extra={<ShareBar title={title} table={() => tableOf(spec, v)} image={() => (chart.current ? chartPng(chart.current, document.documentElement.dataset.mode === 'dark') : undefined)} />}>
      <div className="big-bar"><ViewPicker spec={spec} v={v} setV={setV} />{onPick && drillHint && <span className="muted"><AimOutlined /> {drillHint}</span>}</div>
      {shaped ? <KasChart spec={{ ...shaped, title }} height="calc(100vh - 240px)" onPick={onPick} onReady={(c) => { chart.current = c; }} />
        : <ViewTable spec={spec} v={v} onPick={onPick} height={window.innerHeight - 300} />}
    </FullView>
  );
}

/** Copy picture, copy data, save picture, WhatsApp. */
export function ShareBar({ title, table, image }: { title: string; table: () => { columns: string[]; rows: (string | number)[][] }; image?: () => string | undefined }) {
  const { api } = useSession();
  const { message } = AntApp.useApp();
  const run = async (what: string, f: () => Promise<unknown>) => {
    try { await f(); void message.success(what); } catch (e) { void message.error(e instanceof Error && e.message ? e.message : 'That did not work.'); }
  };
  const pic = image?.();
  const caption = () => {
    const t = table();
    const lines = t.rows.slice(0, 10).map((r) => `${r[0]}: ${r.slice(1).filter((x) => x !== '').map((x) => (typeof x === 'number' ? x.toLocaleString() : x)).join(' / ')}`);
    return `${title}\n${lines.join('\n')}${t.rows.length > 10 ? `\n...and ${t.rows.length - 10} more` : ''}`;
  };
  return (
    <Space size={6} wrap>
      {image && <Tooltip title="Copy the picture, then paste it anywhere"><Button size="small" icon={<PictureOutlined />} onClick={() => { const p = image(); if (p) void run('Picture copied', () => copyImage(p)); }}>Copy picture</Button></Tooltip>}
      <Tooltip title="Copy the figures as a table (pastes into Excel)"><Button size="small" icon={<CopyOutlined />} onClick={() => void run('Figures copied', () => copyText(tsv(table())))}>Copy data</Button></Tooltip>
      {image && <Button size="small" icon={<DownloadOutlined />} onClick={() => { const p = image(); if (p) void run('Saved to Downloads', () => savePng(api, fileName(title), p)); }}>Save picture</Button>}
      <Tooltip title={pic !== undefined || image ? 'Opens WhatsApp with the figures; the picture is copied, paste it in the chat' : 'Opens WhatsApp with the figures'}>
        <Button size="small" className="wa-btn" icon={<WhatsAppOutlined />} onClick={() => void run(image ? 'Picture copied: paste it in the WhatsApp chat' : 'WhatsApp opened', () => shareWhatsApp(api, caption(), image?.()))}>WhatsApp</Button>
      </Tooltip>
    </Space>
  );
}
