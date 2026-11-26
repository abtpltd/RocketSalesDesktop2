import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Breadcrumb, Button, DatePicker, Empty, Result, Segmented, Select, Tooltip } from 'antd';
import { AimOutlined, ReloadOutlined, RollbackOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { describeError } from '../../api/messages';
import { asAppError, useSession } from '../../session';
import StillLoading from '../../dashboard/StillLoading';
import ExportButton from '../../ui/ExportButton';
import MoreMenu from '../../ui/MoreMenu';
import { fileName } from '../../ui/excel';
import Profile360 from '../Profile360';
import TagCheck from './TagCheck';
import { attachBaseMap } from './mapBase';
import {
  coverage, groups, inTrail, LEVEL_WORD, measureOf, nextLevel, pinTone, short, STALE_DAYS, targetPct, tone, toPoints, totals,
  type Group, type MapPayload, type Measure, type Point, type Trail,
} from './mapMath';

type Layer = 'bubbles' | 'heat' | 'pins';
const COLOR = { ok: '#1f9d55', mid: '#e0a100', low: '#d64545', none: '#7b8794' } as const;
const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);

/**
 * Map View: customers or doctors on the map, added up per HQ, area and sales rep. Click a bubble (or a row) to drill
 * in; the trail at the top goes back out. Bubbles, a heat map or one pin per customer. Read only.
 */
export default function MapViewPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report, setOffline } = useSession();
  const [kind, setKind] = useState<'customers' | 'doctors'>('customers');
  const [measure, setMeasure] = useState<Measure>('value');
  const [layer, setLayer] = useState<Layer>('bubbles');
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => [dayjs().startOf('month'), dayjs()]);
  const [trail, setTrail] = useState<Trail>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [check, setCheck] = useState<string | null>(null);
  const from = range[0].format('YYYY-MM-DD'), to = range[1].format('YYYY-MM-DD');
  const q = useQuery({
    queryKey: ['report', 'map_view', kind, from, to],
    queryFn: () => api.fetchReport('map_view', { from, to, kind }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const p = q.data?.data as unknown as MapPayload | undefined;
  const all = useMemo(() => (p ? toPoints(p) : []), [p]);
  const scoped = useMemo(() => all.filter((x) => inTrail(x, trail)), [all, trail]);
  const level = nextLevel(trail);
  const list = useMemo(() => (level && p ? groups(scoped, level, p.targets, p.rep_sales) : [])
    .sort((a, b) => measureOf(b, measure) - measureOf(a, measure)), [scoped, level, p, measure]);
  const tot = useMemo(() => totals(scoped, p?.targets ?? {}, p?.rep_sales ?? {}), [scoped, p]);
  const doctors = kind === 'doctors';
  useEffect(() => { if (doctors && (measure === 'value' || measure === 'target')) setMeasure('visits'); }, [doctors, measure]);
  useEffect(() => { setSelected(null); }, [trail, kind]);
  const shownLayer: Layer = !level && layer === 'bubbles' ? 'pins' : layer;
  const point = scoped.find((x) => x.code === selected) ?? null;

  if (q.isPending) return <StillLoading />;
  if (q.isError && !p) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open the Visit Report</Button>]} />;
  }
  if (!p) return null;

  const drill = (name: string) => { if (level) setTrail([...trail, { level, name }]); };
  const measureText = (g: Group) => measure === 'value' ? short(g.value) : measure === 'visits' ? g.visits.toLocaleString()
    : measure === 'coverage' ? pct(coverage(g)) : measure === 'target' ? pct(targetPct(g)) : g.stale.toLocaleString();
  const noun = doctors ? 'doctors' : 'customers';
  const scopeName = trail.length ? trail[trail.length - 1].name : 'All company';
  const notVisited = [...scoped].sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9)).slice(0, 30);

  return (
    <div className="mv">
      <div className="page-title">
        <h2>Map View</h2>
        <Breadcrumb items={[{ title: <a onClick={() => setTrail([])}>All company</a> },
          ...trail.map((t, i) => ({ title: i === trail.length - 1 ? <b>{t.name}</b> : <a onClick={() => setTrail(trail.slice(0, i + 1))}>{t.name}</a> }))]} />
        <span className="spacer" />
        {trail.length > 0 && <Button size="small" icon={<RollbackOutlined />} onClick={() => setTrail(trail.slice(0, -1))}>Back</Button>}
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <ExportButton name={fileName('Map View', scopeName, from, to)} sheet="Map View" disabled={!scoped.length}
          load={async () => level ? ({
            columns: [{ key: 'name', title: LEVEL_WORD[level] }, { key: 'count', title: doctors ? 'Doctors' : 'Customers' }, { key: 'located', title: 'On the map' },
              ...(doctors ? [] : [{ key: 'value', title: 'Order value' }, { key: 'target', title: 'Target %' }]), { key: 'visits', title: 'Visits' },
              { key: 'coverage', title: 'Visited %' }, { key: 'stale', title: `Not visited ${STALE_DAYS} days` }],
            rows: list.map((g) => ({ ...g, value: Math.round(g.value), target: targetPct(g) === null ? '' : Math.round(targetPct(g)!), coverage: Math.round(coverage(g)) })),
          }) : ({
            columns: [{ key: 'code', title: 'Code' }, { key: 'name', title: 'Name' }, { key: 'hq', title: 'HQ' }, { key: 'area', title: 'Area' }, { key: 'rep', title: 'Sales rep' },
              ...(doctors ? [] : [{ key: 'value', title: 'Order value' }]), { key: 'visits', title: 'Visits' }, { key: 'last', title: 'Last visit' },
              { key: 'lat', title: 'Latitude' }, { key: 'lng', title: 'Longitude' }],
            rows: scoped.map((x) => ({ ...x })),
          })} />
        <MoreMenu items={[{ key: 'classic', label: 'Open the Visit Report', onClick: () => openClassic(classicPath) }]} />
      </div>
      <div className="filters">
        <DatePicker.RangePicker allowClear={false} format="DD-MM-YYYY" value={range} onChange={(v) => { if (v && v[0] && v[1]) setRange([v[0], v[1]]); }} />
        <Segmented value={kind} onChange={(v) => { setKind(v as 'customers' | 'doctors'); setTrail([]); }} options={[{ value: 'customers', label: 'Customers' }, { value: 'doctors', label: 'Doctors' }]} />
        <Segmented value={measure} onChange={(v) => setMeasure(v as Measure)} options={[
          ...(doctors ? [] : [{ value: 'value', label: 'Order value' }]), { value: 'visits', label: 'Visits' }, { value: 'coverage', label: 'Visited %' },
          ...(doctors ? [] : [{ value: 'target', label: 'Target %' }]), { value: 'stale', label: `Not visited ${STALE_DAYS}d` }]} />
        <span className="spacer" />
        <Select showSearch allowClear placeholder={`Find a ${doctors ? 'doctor' : 'customer'}`} style={{ width: 260 }} value={null} optionFilterProp="label"
          options={scoped.slice(0, 5000).map((x) => ({ value: x.code, label: `${x.name} (${x.code})` }))}
          onChange={(code: string | null) => {
            const x = all.find((y) => y.code === code);
            if (x) { setTrail([{ level: 'hq', name: x.hq }, { level: 'area', name: x.area }, { level: 'rep', name: x.rep }]); setTimeout(() => setSelected(x.code), 0); }
          }} />
      </div>
      {range[1].diff(range[0], 'day') > 92 && <Alert type="info" showIcon style={{ marginBottom: 10 }} title="Choose three months or less." />}
      <div className="mv-body">
        <div className="mv-map">
          <LeafMap list={level ? list : []} points={scoped} layer={shownLayer} measure={measure} selected={selected}
            onGroup={drill} onPoint={setSelected} fitKey={`${kind}|${JSON.stringify(trail)}|${from}|${to}`} />
          <div className="mv-layer"><Segmented size="small" value={shownLayer} onChange={(v) => setLayer(v as Layer)}
            options={[{ value: 'bubbles', label: 'Bubbles', disabled: !level }, { value: 'heat', label: 'Heat' }, { value: 'pins', label: 'Pins' }]} /></div>
          <div className="mv-legend">
            {shownLayer === 'heat' ? <><span>Fewer</span><i className="mv-heatbar" /><span>More {measure === 'value' ? 'order value' : 'visits'}</span></>
              : shownLayer === 'pins' ? <><span><i style={{ background: COLOR.ok }} />Visited in 14 days</span><span><i style={{ background: COLOR.mid }} />15–{STALE_DAYS} days</span><span><i style={{ background: COLOR.low }} />Over {STALE_DAYS} days or never</span></>
              : <><span><i style={{ background: COLOR.ok }} />{measure === 'stale' ? 'Few not visited' : measure === 'visits' || measure === 'coverage' ? '80%+ visited' : 'Target reached'}</span>
                <span><i style={{ background: COLOR.mid }} />{measure === 'stale' ? 'Some' : measure === 'visits' || measure === 'coverage' ? '60–79%' : '80–99%'}</span>
                <span><i style={{ background: COLOR.low }} />{measure === 'stale' ? 'Over 30% not visited' : measure === 'visits' || measure === 'coverage' ? 'Below 60%' : 'Below 80%'}</span>
                <span className="muted">Size: {measure === 'value' ? 'order value' : measure === 'visits' ? 'visits' : measure === 'stale' ? 'not visited' : noun}</span></>}
          </div>
          {level && <div className="mv-note"><AimOutlined /> Click a bubble or a row to see its {LEVEL_WORD[level] === 'Sales rep' ? 'sales reps' : `${LEVEL_WORD[level]}s`.replace('HQs', 'HQs')}</div>}
        </div>
        <aside className="mv-panel">
          <div className="mv-head"><b>{scopeName}</b><span className="muted">{tot.count.toLocaleString()} {noun}{level ? ` in ${list.length} ${level === 'rep' ? 'sales reps' : `${LEVEL_WORD[level]}s`}` : ''}</span></div>
          <div className="mv-kpis">
            {!doctors && <div><span>Order value</span><b>{short(tot.value)}</b></div>}
            {!doctors && <div><span>Target achieved</span><b>{pct(tot.targetPct)}</b></div>}
            <div><span>Visits</span><b>{tot.visits.toLocaleString()}</b></div>
            <div><span>Visited</span><b>{pct(tot.count ? (tot.visited / tot.count) * 100 : 0)}</b></div>
            {doctors && <div><span>Not visited {STALE_DAYS}d</span><b>{tot.stale.toLocaleString()}</b></div>}
            {doctors && <div><span>On the map</span><b>{tot.located.toLocaleString()}</b></div>}
          </div>
          {point && <PointCard pt={point} doctors={doctors} onOpen={() => setProfile(point.code)} onCheck={() => setCheck(point.code)} onClose={() => setSelected(null)} />}
          {level ? (
            <div className="mv-list">
              {!list.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${noun} here`} />}
              {list.map((g, i) => {
                const t = tone(g, measure);
                const max = Math.max(1, ...list.map((x) => Math.max(0, measureOf(x, measure))));
                return (
                  <button key={g.name} type="button" className="mv-row" onClick={() => drill(g.name)}>
                    <span className="muted">{i + 1}</span>
                    <span className="mv-name"><b>{g.name}</b><i className="mv-bar"><i style={{ width: `${(Math.max(0, measureOf(g, measure)) / max) * 100}%`, background: COLOR[t] }} /></i>
                      <small className="muted">{g.count.toLocaleString()} {noun}{g.located < g.count ? `, ${g.count - g.located} not on the map` : ''}</small></span>
                    <span className="mv-val">{measureText(g)}</span>
                    {!doctors && measure !== 'target' && <Tooltip title="Target achieved by the sales reps based here"><span className={`tg-chip ${t === 'ok' ? 'ok' : t === 'mid' ? 'w' : 'b'}`}>{pct(targetPct(g))}</span></Tooltip>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mv-list">
              <div className="mv-sub">Not visited the longest</div>
              {notVisited.map((x) => (
                <button key={x.code} type="button" className={`mv-row two${x.code === selected ? ' on' : ''}`} onClick={() => setSelected(x.code)}>
                  <span className="mv-name"><b>{x.name}</b><small className="muted">{x.code}{x.lat === null ? ' · not on the map' : ''}</small></span>
                  <span className="mv-val" style={{ color: COLOR[pinTone(x)] }}>{x.days === null ? 'never' : `${x.days} days`}</span>
                </button>
              ))}
            </div>
          )}
          {tot.located < tot.count && <div className="muted mv-foot">{(tot.count - tot.located).toLocaleString()} {noun} have no map location: counted in the figures and in the Excel download.</div>}
        </aside>
      </div>
      <TagCheck code={check} kind={kind} from={from} to={to} onClose={() => setCheck(null)} />
      <Profile360 kind={doctors ? 'doctor' : 'customer'} recordKey={profile ? `code:${profile}` : null} onClose={() => setProfile(null)} />
    </div>
  );
}

function PointCard({ pt, doctors, onOpen, onCheck, onClose }: { pt: Point; doctors: boolean; onOpen: () => void; onCheck: () => void; onClose: () => void }) {
  return (
    <div className="mv-card">
      <div className="mv-card-head"><div><b>{pt.name}</b><div className="muted">{pt.code} · {pt.rep}</div></div><Button size="small" type="text" onClick={onClose} aria-label="Close">×</Button></div>
      <dl>
        <dt>Last visit</dt><dd style={{ color: COLOR[pinTone(pt)] }}>{pt.days === null ? 'Never' : pt.days === 0 ? 'Today' : `${pt.days} days ago`}</dd>
        <dt>Visits in range</dt><dd>{pt.visits}</dd>
        {!doctors && <><dt>Orders in range</dt><dd>{pt.orders} · {short(pt.value)}</dd></>}
        <dt>HQ / Area</dt><dd>{pt.hq} / {pt.area}</dd>
      </dl>
      <Button size="small" block icon={<AimOutlined />} onClick={onCheck} style={{ marginBottom: 6 }}>Check tag against visits</Button>
      <Button type="primary" size="small" block onClick={onOpen}>Open {doctors ? 'doctor' : 'customer'} 360°</Button>
    </div>
  );
}

/** The Leaflet map: bubbles per group, a glow (heat) per customer, or one pin per customer. */
function LeafMap({ list, points, layer, measure, selected, onGroup, onPoint, fitKey }: {
  list: Group[]; points: Point[]; layer: Layer; measure: Measure; selected: string | null;
  onGroup: (name: string) => void; onPoint: (code: string) => void; fitKey: string;
}) {
  const { api } = useSession();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const drawn = useRef<L.LayerGroup | null>(null);
  const fitted = useRef('');
  // a map in a hidden tab has no size: wait until it is shown before drawing (Leaflet cannot fit a 0x0 map)
  const [shown, setShown] = useState(0);
  const handlers = useRef({ onGroup, onPoint });
  handlers.current = { onGroup, onPoint };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, preferCanvas: true }).setView([-0.02, 37.9], 6);
    const stop = attachBaseMap(api, m);
    drawn.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => { m.invalidateSize(); if (el.current?.clientWidth) setShown((n) => n + 1); });
    ro.observe(el.current);
    return () => { stop(); ro.disconnect(); drawn.current?.clearLayers(); drawn.current = null; m.remove(); map.current = null; };
  }, [api]);

  useEffect(() => {
    const m = map.current, g = drawn.current;
    if (!m || !g || !el.current?.clientWidth) return;
    g.clearLayers();
    const located = points.filter((x) => x.lat !== null && x.lng !== null);
    if (layer === 'bubbles') {
      const vals = list.map((x) => Math.max(0, measure === 'value' ? x.value : measure === 'visits' ? x.visits : measure === 'stale' ? x.stale : x.count));
      const max = Math.max(1, ...vals);
      list.forEach((x, i) => {
        if (x.lat === null || x.lng === null) return;
        const r = 10 + 26 * Math.sqrt(vals[i] / max);
        const label = measure === 'value' ? short(x.value) : measure === 'visits' ? x.visits.toLocaleString() : measure === 'coverage' ? pct(coverage(x))
          : measure === 'target' ? pct(targetPct(x)) : x.stale.toLocaleString();
        L.circleMarker([x.lat, x.lng], { radius: r, color: '#fff', weight: 2.5, fillColor: COLOR[tone(x, measure)], fillOpacity: 0.8 })
          .bindTooltip(`<b>${esc(x.name)}</b> ${label}`, { permanent: true, direction: 'bottom', offset: [0, r], className: 'mv-tip' })
          .on('click', () => handlers.current.onGroup(x.name)).addTo(g);
      });
    } else if (layer === 'heat') {
      const w = located.map((x) => (measure === 'value' ? x.value : measure === 'stale' ? (x.days === null || x.days > 30 ? 1 : 0) : x.visits));
      const max = Math.max(1, ...w);
      located.forEach((x, i) => {
        if (!w[i]) return;
        const k = Math.sqrt(w[i] / max);
        L.circleMarker([x.lat!, x.lng!], { radius: 14 + 16 * k, stroke: false, fillColor: k > 0.6 ? '#d64545' : k > 0.3 ? '#f08c00' : '#f2c94c', fillOpacity: 0.06 + 0.16 * k, interactive: false }).addTo(g);
      });
    } else {
      located.forEach((x) => {
        const on = x.code === selected;
        L.circleMarker([x.lat!, x.lng!], { radius: on ? 10 : 6, color: on ? '#1677c8' : '#fff', weight: on ? 3 : 1.5, fillColor: COLOR[pinTone(x)], fillOpacity: 0.95 })
          .bindTooltip(`${esc(x.name)}<br><small>${x.days === null ? 'never visited' : `last visit ${x.days} days ago`}</small>`)
          .on('click', () => handlers.current.onPoint(x.code)).addTo(g);
      });
    }
    if (fitted.current !== fitKey) {
      const pts = located.map((x) => [x.lat!, x.lng!] as [number, number]);
      if (pts.length) { m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 }); fitted.current = fitKey; }
    }
  }, [list, points, layer, measure, selected, fitKey, shown > 0]);

  useEffect(() => {
    const x = points.find((p) => p.code === selected);
    if (x && x.lat !== null && x.lng !== null && map.current) map.current.panTo([x.lat, x.lng]);
  }, [selected, points]);

  return <div ref={el} className="ee-leaflet" role="application" aria-label="Map of customers" />;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
