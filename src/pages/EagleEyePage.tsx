import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, DatePicker, Empty, Result, Select, Tooltip } from 'antd';
import {
  AimOutlined, CameraOutlined, CheckCircleOutlined, CloseOutlined, ExpandOutlined, ExperimentOutlined, FlagOutlined,
  GiftOutlined, LeftOutlined, LoginOutlined, LogoutOutlined, MessageOutlined, PauseOutlined, CaretRightOutlined,
  ReadOutlined, ReloadOutlined, RightOutlined, RollbackOutlined, ShoppingCartOutlined, TeamOutlined, WarningOutlined,
} from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Api, MapStatus } from '../api/types';
import { AppRangeSource, FALLBACK_STATUS, layerKind, OSM_ATTRIBUTION, PROTOMAPS_ATTRIBUTION } from './mapSource';
import type { EaglePayload, EagleStop } from '../api/types';
import { describeError, syncedAgo } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import { arrows, awayFromTag, dayBar, distanceText, dur, stopActivities, timeline } from './eagleMath';

const LAST_REP = 'eagle-last-rep';
const readRep = () => { try { return localStorage.getItem(LAST_REP) ?? ''; } catch { return ''; } };
const saveRep = (k: string) => { try { localStorage.setItem(LAST_REP, k); } catch { /* optional */ } };
const KIND_LABEL: Record<EagleStop['kind'], string> = { customer: 'Customer', doctor: 'Doctor', service: 'Service call' };
type Filter = 'customer' | 'doctor' | 'service' | 'orders' | 'away';

const ACT_ICON: Record<string, React.ReactNode> = {
  in: <LoginOutlined />, out: <LogoutOutlined />, order: <ShoppingCartOutlined />, sales: <ShoppingCartOutlined />,
  return: <RollbackOutlined />, feedback: <MessageOutlined />, photo: <CameraOutlined />, detail: <ReadOutlined />,
  sample: <ExperimentOutlined />, gift: <GiftOutlined />, with: <TeamOutlined />,
};

/** One rep's day: what happened, in order, on a map with the GPS route. Read-only. */
export default function EagleEyePage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report, setOffline } = useSession();
  const [rep, setRep] = useState(readRep);
  const [date, setDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [selected, setSelected] = useState<number | null>(null);
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [replay, setReplay] = useState<{ index: number; playing: boolean } | null>(null);
  const q = useQuery({
    queryKey: ['report', 'eagle_eye', rep, date],
    queryFn: () => api.fetchReport('eagle_eye', { rep, from: date }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const p = q.data?.data as unknown as EaglePayload | undefined;

  // a remembered rep who is no longer in the list is forgotten; otherwise the first rep is shown
  useEffect(() => {
    if (!p) return;
    if (rep && !p.users.some((u) => u.key === rep)) setRep('');
    else if (!rep && p.users.length) setRep(p.users[0].key);
  }, [p, rep]);
  useEffect(() => { setSelected(null); setReplay(null); }, [rep, date]);

  const stops = p?.stops ?? [];
  const show = (s: EagleStop) => {
    if (!filters.size) return true;
    return (filters.has(s.kind as Filter))
      || (filters.has('orders') && s.activities.some((a) => a.kind === 'Order'))
      || (filters.has('away') && awayFromTag(s));
  };
  const items = p ? timeline(p, show) : [];
  const sel = stops.find((s) => s.n === selected) ?? null;
  const counts = {
    customer: stops.filter((s) => s.kind === 'customer').length, doctor: stops.filter((s) => s.kind === 'doctor').length,
    service: stops.filter((s) => s.kind === 'service').length,
    orders: stops.filter((s) => s.activities.some((a) => a.kind === 'Order')).length, away: stops.filter(awayFromTag).length,
  };
  const toggle = (f: Filter) => setFilters((x) => { const n = new Set(x); if (n.has(f)) n.delete(f); else n.add(f); return n; });

  // replay: move a marker along the GPS points, about 25 seconds for the whole day
  const track = p?.track ?? [];
  useEffect(() => {
    if (!replay?.playing || track.length < 2) return;
    const step = Math.max(1, Math.round(track.length / 250));
    const t = setInterval(() => setReplay((r) => {
      if (!r) return r;
      const next = r.index + step;
      return next >= track.length - 1 ? { index: track.length - 1, playing: false } : { ...r, index: next };
    }), 100);
    return () => clearInterval(t);
  }, [replay?.playing, track.length]);

  // keep the chosen stop's line in view in the list
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected == null) return;
    listRef.current?.querySelector(`[data-stop="${selected}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  if (q.isPending) return <StillLoading />;
  if (q.isError && !p) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  if (!p) return null;
  const { source, saved_at } = q.data!;
  const t = p.totals;
  const bar = dayBar(p);
  const repName = p.users.find((u) => u.key === rep);
  const move = (dir: -1 | 1) => setDate((d) => dayjs(d).add(dir, 'day').format('YYYY-MM-DD'));
  const goStop = (dir: -1 | 1) => {
    if (!sel) return;
    const i = stops.findIndex((s) => s.n === sel.n) + dir;
    if (i >= 0 && i < stops.length) setSelected(stops[i].n);
  };

  return (
    <div className="eagle">
      <div className="page-title">
        <h2>Eagle Eye View</h2>
        <Select showSearch style={{ minWidth: 240 }} placeholder="Choose a rep" value={rep || undefined} optionFilterProp="label"
          options={p.users.map((u) => ({ value: u.key, label: `${u.name} (${u.code})` }))}
          onChange={(v) => { setRep(v); saveRep(v); }} aria-label="Rep" />
        <Button icon={<LeftOutlined />} onClick={() => move(-1)} aria-label="Previous day" />
        <DatePicker allowClear={false} value={dayjs(date)} format="ddd DD-MM-YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          onChange={(v) => { if (v) setDate(v.format('YYYY-MM-DD')); }} />
        <Button icon={<RightOutlined />} onClick={() => move(1)} disabled={!dayjs(date).isBefore(dayjs(), 'day')} aria-label="Next day" />
        <span className="muted">{source === 'offline' ? `Saved copy from ${syncedAgo(saved_at, Math.floor(Date.now() / 1000))}` : ''}</span>
        <span className="spacer" />
        <Button icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <Button type="primary" icon={replay?.playing ? <PauseOutlined /> : <CaretRightOutlined />} disabled={track.length < 2}
          onClick={() => setReplay((r) => (r?.playing ? { ...r, playing: false } : { index: r && r.index < track.length - 1 ? r.index : 0, playing: true }))}>
          {replay?.playing ? 'Pause' : 'Replay the day'}
        </Button>
      </div>

      {!p.users.length && <Alert type="info" showIcon title="No reps to show" description="Your role has no app users linked to it." />}

      {t && (
        <div className="ee-strip">
          <div className="ee-day">
            <div className="l">Working day</div>
            <div className="v">{p.day?.start || '—'} <span className="arrow">→</span> {p.day?.end || (p.day?.start ? 'still working' : '—')}
              {t.minutes_working != null && <small>{dur(t.minutes_working)}</small>}</div>
            <div className="ee-bar" aria-hidden>{bar.map((b, i) => <span key={i} className={`k-${b.kind}`} style={{ left: `${b.left}%`, width: `${b.width}%` }} />)}</div>
          </div>
          <div><div className="l">Customer visits</div><div className="v">{t.customers}</div></div>
          <div><div className="l">Doctor visits</div><div className="v">{t.doctors}</div></div>
          <div><div className="l">Orders</div><div className="v">{t.orders}{t.order_value > 0 && <small>{t.order_value.toLocaleString()}</small>}</div></div>
          <div><div className="l">Distance (GPS)</div><div className="v">{t.distance_km}<small>km</small></div></div>
          <div><div className="l">Time at stops</div><div className="v">{dur(t.minutes_at_stops) || '0 min'}</div>
            {(p.gaps ?? []).length > 0 && <div className="warn">{dur((p.gaps ?? []).reduce((a, g) => a + g.minutes, 0))} with no activity</div>}</div>
        </div>
      )}

      <div className="ee-body">
        <div className="ee-list">
          <div className="ee-filters">
            {([['customer', 'Customers'], ['doctor', 'Doctors'], ['service', 'Service calls'], ['orders', 'With order'], ['away', 'Away from tag']] as [Filter, string][])
              .filter(([f]) => counts[f] > 0 || filters.has(f))
              .map(([f, label]) => (
                <button key={f} type="button" className={`ee-pill${filters.has(f) ? ' on' : ''} f-${f}`} onClick={() => toggle(f)} aria-pressed={filters.has(f)}>
                  {f === 'away' ? <WarningOutlined /> : f === 'orders' ? <ShoppingCartOutlined /> : <i />}{label} {counts[f]}
                </button>
              ))}
          </div>
          <div className="ee-tl" ref={listRef}>
            {rep && !items.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No activity for ${repName?.name ?? 'this rep'} on ${dayjs(date).format('DD-MM-YYYY')}`} />}
            {items.map((it, i) => {
              if (it.type === 'gap') return <div key={`g${i}`} className="ee-gap">No activity {it.from} to {it.to} ({dur(it.minutes)})</div>;
              if (it.type === 'start' || it.type === 'end') {
                return (
                  <div key={it.type} className="ee-st">
                    <span className={`ee-num k-${it.type}`}>{it.type === 'start' ? 'S' : 'E'}</span>
                    <div><div className="t1">{it.type === 'start' ? 'Start day' : 'End day'}</div><div className="t2">{it.text}</div></div>
                    <div className="tm">{it.time}</div>
                  </div>
                );
              }
              const s = it.stop;
              const orders = s.activities.filter((a) => a.kind === 'Order');
              return (
                <button key={s.n} type="button" data-stop={s.n} className={`ee-st click${s.n === selected ? ' sel' : ''}`}
                  onClick={() => setSelected(s.n === selected ? null : s.n)}>
                  <span className={`ee-num k-${s.kind}`}>{s.n}</span>
                  <div>
                    <div className="t1">{s.name}</div>
                    <div className="t2">{s.remarks || [KIND_LABEL[s.kind], s.speciality || s.category, s.area].filter(Boolean).join(', ')}</div>
                    <div className="ee-tags">
                      {orders.map((o, j) => <span key={j} className="tag ord">Order {typeof o.amount === 'number' ? o.amount.toLocaleString() : o.amount}</span>)}
                      {s.kind === 'customer' && !orders.length && <span className="tag no">No order</span>}
                      {s.detailing > 0 && <span className="tag">Detailing {s.detailing}</span>}
                      {s.samples > 0 && <span className="tag">Samples {s.samples}</span>}
                      {s.photo && <span className="tag">Photo</span>}
                      {awayFromTag(s) && <span className="tag far">{distanceText(s.distance_m)} from tag</span>}
                      {!s.geo && <span className="tag">No location</span>}
                    </div>
                  </div>
                  <div className="tm">{s.time_in}{s.minutes != null && <small>{dur(s.minutes)}</small>}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="ee-map">
          <DayMap p={p} selected={selected} onSelect={setSelected} replayIndex={replay ? replay.index : null} visible={show} filterKey={[...filters].sort().join(',')} />
          <Tooltip title="Show the whole day"><button type="button" className="ee-fit" onClick={() => setSelected(null)}><ExpandOutlined /> Whole day</button></Tooltip>
          {!sel && (
            <div className="ee-legend">
              <span><i className="k-start" />Start</span><span><i className="k-customer" />Customer</span><span><i className="k-doctor" />Doctor</span>
              {counts.service > 0 && <span><i className="k-service" />Service</span>}<span><i className="k-end" />End</span><span><i className="ln" />GPS route</span>
            </div>
          )}
          {replay && track.length > 1 && (
            <div className="ee-replay">
              <button type="button" onClick={() => setReplay((r) => r && { ...r, playing: !r.playing })} aria-label={replay.playing ? 'Pause' : 'Play'}>
                {replay.playing ? <PauseOutlined /> : <CaretRightOutlined />}</button>
              <span>{track[replay.index]?.[2] ?? ''}</span>
              <input type="range" min={0} max={track.length - 1} value={replay.index} aria-label="Replay position"
                onChange={(e) => setReplay({ index: Number(e.target.value), playing: false })} />
              <span>{track[track.length - 1]?.[2] ?? ''}</span>
              <button type="button" onClick={() => setReplay(null)} aria-label="Close replay"><CloseOutlined /></button>
            </div>
          )}
          {sel && <StopCard s={sel} onClose={() => setSelected(null)} onPrev={() => goStop(-1)} onNext={() => goStop(1)}
            first={stops[0]?.n === sel.n} last={stops[stops.length - 1]?.n === sel.n} />}
          {rep && !sel && !(p.track ?? []).length && !stops.some((s) => s.geo) && (
            <div className="ee-nomap">No GPS points or visit locations for this day</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StopCard({ s, onClose, onPrev, onNext, first, last }: { s: EagleStop; onClose: () => void; onPrev: () => void; onNext: () => void; first: boolean; last: boolean }) {
  const acts = stopActivities(s);
  return (
    <section className="ee-card" aria-label={`Stop ${s.n}: ${s.name}`}>
      <header>
        <span className={`ee-num k-${s.kind}`}>{s.n}</span>
        <div><h4>{s.name}</h4><div className="sub">{[KIND_LABEL[s.kind], s.speciality || s.category, s.hq].filter(Boolean).join(', ')}</div></div>
        <button type="button" className="x" onClick={onClose} aria-label="Close"><CloseOutlined /></button>
      </header>
      <div className="ee-facts">
        <div><div className="l">In / out</div><div className="v">{s.time_in || '—'}{s.time_out ? ` – ${s.time_out}` : ''}</div></div>
        <div><div className="l">Time spent</div><div className="v">{dur(s.minutes) || '—'}</div></div>
        <div><div className="l">From tag</div>
          <div className={`v ${awayFromTag(s) ? 'bad' : 'good'}`}>{s.distance_m == null ? '—' : awayFromTag(s) ? <><WarningOutlined /> {distanceText(s.distance_m)}</> : <><CheckCircleOutlined /> {distanceText(s.distance_m)}</>}</div></div>
      </div>
      <div className="ee-acts">
        {acts.map((a, i) => (
          <div key={i} className={`ee-act a-${a.icon}`}>
            <span className="ai">{ACT_ICON[a.icon] ?? <FlagOutlined />}</span>
            <div><b>{a.title}</b>{a.detail && <small>{a.detail}</small>}</div>
            <span className="at">{a.time}</span>
          </div>
        ))}
        {s.planned && <div className="ee-planned"><AimOutlined /> On today's route plan</div>}
      </div>
      <footer>
        <Button size="small" onClick={onPrev} disabled={first}><LeftOutlined /> Previous stop</Button>
        <Button size="small" onClick={onNext} disabled={last}>Next stop <RightOutlined /></Button>
      </footer>
    </section>
  );
}

const PIN = (cls: string, text: string, extra = '') => L.divIcon({
  className: '', iconSize: [30, 38], iconAnchor: [15, 37],
  html: `<div class="ee-pin ${cls}${extra}"><b></b><span>${text}</span></div>`,
});

/** The base map: OpenStreetMap pictures or the company's Protomaps file, both kept on this computer by the app. */
async function baseLayer(api: Api, status: MapStatus): Promise<L.Layer> {
  if (layerKind(status) === 'protomaps') {
    // loaded only when a company really uses Protomaps, so the app itself stays small
    const [{ PMTiles }, { leafletLayer }] = await Promise.all([import('pmtiles'), import('protomaps-leaflet')]);
    const pm = new PMTiles(new AppRangeSource(api, status.pmtiles_url));
    return leafletLayer({ url: pm, flavor: 'light', lang: 'en', attribution: PROTOMAPS_ATTRIBUTION }) as unknown as L.Layer;
  }
  return L.tileLayer(api.mapTileUrl(), { maxZoom: 19, attribution: OSM_ATTRIBUTION });
}

/** The Leaflet map: base map pictures, the GPS route with direction arrows, numbered stops, start and end. */
function DayMap({ p, selected, onSelect, replayIndex, visible, filterKey }: {
  p: EaglePayload; selected: number | null; onSelect: (n: number) => void; replayIndex: number | null;
  visible: (s: EagleStop) => boolean; filterKey: string;
}) {
  const { api } = useSession();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef<Map<number, L.Marker>>(new Map());
  const mover = useRef<L.Marker | null>(null);
  const bounds = useRef<L.LatLngBounds | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, preferCanvas: false }).setView([-0.02, 37.9], 6);
    // The app says which source to draw. When OpenStreetMap pictures fail, ask again: on "auto" the app moves to
    // the company's Protomaps file after OpenStreetMap refused this computer.
    let alive = true;
    let base: L.Layer | null = null;
    let drawn = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = async (status: MapStatus) => {
      const kind = layerKind(status);
      if (!alive || kind === drawn) return;
      drawn = kind;
      let next: L.Layer;
      try {
        next = await baseLayer(api, status);
      } catch {
        drawn = '';
        if (kind === 'protomaps') void apply(FALLBACK_STATUS);
        return;
      }
      if (!alive || drawn !== kind) return;
      if (base) m.removeLayer(base);
      base = next;
      if (kind === 'osm') base.on('tileerror', check);
      base.addTo(m);
    };
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { api.mapStatus().then(apply).catch(() => undefined); }, 1500);
    };
    api.mapStatus().then(apply).catch(() => apply(FALLBACK_STATUS));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { alive = false; clearTimeout(timer); ro.disconnect(); m.remove(); map.current = null; };
  }, [api]);

  const stops = useMemo(() => p.stops ?? [], [p]);
  useEffect(() => {
    const m = map.current; const g = layer.current;
    if (!m || !g) return;
    g.clearLayers(); markers.current.clear(); mover.current = null;
    const pts = (p.track ?? []).map((t) => [t[0], t[1]] as [number, number]);
    const all: [number, number][] = [...pts];
    if (pts.length > 1) {
      L.polyline(pts, { color: '#ffffff', weight: 7, opacity: 0.9 }).addTo(g);
      L.polyline(pts, { color: '#1d3b66', weight: 3.5, opacity: 0.95 }).addTo(g);
      for (const a of arrows(pts, 14)) {
        L.marker(a.at, { interactive: false, keyboard: false, icon: L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6],
          html: `<div class="ee-arrow" style="transform: rotate(${a.deg}deg)"></div>` }) }).addTo(g);
      }
    }
    const start = p.day?.start_geo ?? pts[0] ?? null;
    const end = p.day?.end ? (p.last?.geo ?? pts[pts.length - 1] ?? null) : null;
    if (start) { all.push(start); L.marker(start, { icon: PIN('k-start', 'S'), title: `Start day ${p.day?.start ?? ''}`, keyboard: false }).addTo(g); }
    for (const s of stops) {
      if (!s.geo || !visible(s)) continue;
      all.push(s.geo);
      const mk = L.marker(s.geo, { icon: PIN(`k-${s.kind}`, String(s.n)), title: `${s.n}. ${s.name} ${s.time_in}`, riseOnHover: true })
        .on('click', () => onSelect(s.n)).addTo(g);
      markers.current.set(s.n, mk);
    }
    if (end) { all.push(end); L.marker(end, { icon: PIN('k-end', 'E'), title: `End day ${p.day?.end ?? ''}`, keyboard: false }).addTo(g); }
    bounds.current = all.length ? L.latLngBounds(all) : null;
    if (bounds.current) m.fitBounds(bounds.current, { padding: [40, 40], maxZoom: 16 });
    // `visible` changes with every render; filterKey says when the filters really changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, stops, onSelect, filterKey]);

  // selection: dim the others and fly to the chosen stop; no selection fits the whole day again
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const [n, mk] of markers.current) {
      const s = stops.find((x) => x.n === n)!;
      mk.setIcon(PIN(`k-${s.kind}`, String(n), selected == null ? '' : n === selected ? ' sel' : ' dim'));
      mk.setZIndexOffset(n === selected ? 1000 : 0);
    }
    const s = stops.find((x) => x.n === selected);
    if (s?.geo) {
      // keep the stop left of centre so the card on the right does not cover it
      const z = Math.max(m.getZoom(), 16);
      const pt = m.project(s.geo, z).add([170, 0]);
      m.flyTo(m.unproject(pt, z), z, { duration: 0.6 });
    } else if (selected == null && bounds.current) {
      m.flyToBounds(bounds.current, { padding: [40, 40], maxZoom: 16, duration: 0.6 });
    }
  }, [selected, stops]);

  // replay marker
  useEffect(() => {
    const m = map.current; const g = layer.current;
    const t = p.track ?? [];
    if (!m || !g) return;
    if (replayIndex == null || !t[replayIndex]) { if (mover.current) { g.removeLayer(mover.current); mover.current = null; } return; }
    const at: [number, number] = [t[replayIndex][0], t[replayIndex][1]];
    // a marker (not a circle) so it is drawn above the stop pins
    if (!mover.current) {
      mover.current = L.marker(at, { interactive: false, keyboard: false, zIndexOffset: 3000,
        icon: L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10], html: '<div class="ee-mover"></div>' }) }).addTo(g);
    }
    else mover.current.setLatLng(at);
    if (!m.getBounds().pad(-0.15).contains(at)) m.panTo(at, { animate: true });
  }, [replayIndex, p]);

  return <div ref={el} className="ee-leaflet" role="application" aria-label="Map of the day" />;
}
