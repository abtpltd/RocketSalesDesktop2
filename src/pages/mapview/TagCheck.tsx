import { useEffect, useRef, useState } from 'react';
import { Alert, Drawer, Empty, Skeleton, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { describeError } from '../../api/messages';
import { asAppError, useSession } from '../../session';
import { attachBaseMap } from './mapBase';
import { FAR_M, metres, verdictText, type TagPayload, type TagVisit } from './mapMath';

const GOOD = '#1f9d55', BAD = '#d64545', TAG = '#1677c8';

/**
 * Tag check for one customer / doctor: the current tag and every visit in the date range on one map, with each visit's
 * distance from the tag. Read only: it never changes a tag.
 */
export default function TagCheck({ code, kind, from, to, onClose }: { code: string | null; kind: 'customers' | 'doctors'; from: string; to: string; onClose: () => void }) {
  const { api } = useSession();
  const q = useQuery({
    queryKey: ['report', 'tag_visits', kind, code, from, to],
    queryFn: () => api.fetchReport('tag_visits', { search: code ?? '', kind, from, to }),
    enabled: !!code,
  });
  const p = q.data?.data as unknown as TagPayload | undefined;
  const v = p ? verdictText(p) : null;
  return (
    <Drawer open={!!code} onClose={onClose} size={Math.min(900, window.innerWidth)} destroyOnHidden
      title={p ? `Tag check: ${p.record.name} (${p.record.code})` : 'Tag check'}>
      {q.isPending ? <Skeleton active /> : q.isError ? <Alert type="error" showIcon title="The tag check could not be loaded" description={describeError(asAppError(q.error)).text} />
        : p && v ? (
          <div className="tc">
            <Alert type={v.tone === 'ok' ? 'success' : v.tone === 'warn' ? 'warning' : v.tone === 'bad' ? 'error' : 'info'} showIcon title={v.text} />
            <div className="tc-facts">
              <span>Tagged by <b>{p.record.tagged_by || 'not recorded'}</b></span>
              <span>{p.record.verified ? <Tag color="green">Verified tag</Tag> : <Tag>Not verified</Tag>}</span>
              <span>Change requests <b>{p.record.requests}</b></span>
              {p.record.pending && <span>Waiting request <b>{p.record.pending}</b></span>}
            </div>
            <TagMap p={p} />
            <div className="tc-legend"><span><i style={{ background: TAG }} />Current tag</span><span><i style={{ background: GOOD }} />Visit within {FAR_M} m</span><span><i style={{ background: BAD }} />Visit farther away</span></div>
            {p.visits.length ? (
              <Table<TagVisit> size="small" rowKey={(r) => `${r.date}|${r.start}|${r.rep}`} dataSource={p.visits} pagination={{ pageSize: 8, hideOnSinglePage: true }}
                columns={[
                  { title: 'Date', dataIndex: 'date' }, { title: 'Sales rep', dataIndex: 'rep' },
                  { title: 'Time', render: (_: unknown, r) => `${r.start} – ${r.end}` },
                  { title: 'From the tag', align: 'right', render: (_: unknown, r) => <b style={{ color: r.away_m === null ? undefined : r.away_m > FAR_M ? BAD : GOOD }}>{metres(r.away_m)}</b> },
                  { title: 'Inside geofence', align: 'center', render: (_: unknown, r) => (r.within ? 'Yes' : <span style={{ color: BAD }}>No</span>) },
                ]} />
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No visits in this date range" />}
          </div>
        ) : null}
    </Drawer>
  );
}

function TagMap({ p }: { p: TagPayload }) {
  const { api } = useSession();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  // the drawer slides in, so the map has no size at first: draw once it is shown
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView([-0.02, 37.9], 6);
    const stop = attachBaseMap(api, m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => { if (!map.current) return; m.invalidateSize(); if (el.current?.clientWidth) setShown((n) => n + 1); });
    ro.observe(el.current);
    return () => { stop(); ro.disconnect(); layer.current = null; m.remove(); map.current = null; };
  }, [api]);
  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g || !el.current?.clientWidth) return;
    g.clearLayers();
    const pts: [number, number][] = [];
    const tag = p.record.tag;
    p.visits.forEach((x) => {
      if (!x.at) return;
      const far = x.away_m !== null && x.away_m > FAR_M;
      pts.push(x.at);
      if (tag && far) L.polyline([tag, x.at], { color: BAD, weight: 1.5, dashArray: '4 4', opacity: 0.7, interactive: false }).addTo(g);
      L.circleMarker(x.at, { radius: 6, color: '#fff', weight: 1.5, fillColor: far ? BAD : GOOD, fillOpacity: 0.95 })
        .bindTooltip(`${x.date} · ${x.rep}<br><small>${metres(x.away_m)} from the tag</small>`).addTo(g);
    });
    if (tag) {
      pts.push(tag);
      L.circle(tag, { radius: FAR_M, color: TAG, weight: 1, fillOpacity: 0.06, interactive: false }).addTo(g);
      L.circleMarker(tag, { radius: 9, color: '#fff', weight: 3, fillColor: TAG, fillOpacity: 1 }).bindTooltip('Current tag', { permanent: true, direction: 'top' }).addTo(g);
    }
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
  }, [p, shown > 0]);
  return <div ref={el} className="tc-map" role="application" aria-label="Map of the tag and visits" />;
}
