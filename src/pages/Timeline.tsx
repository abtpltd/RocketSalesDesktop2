import MoreMenu from '../ui/MoreMenu';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Drawer, Empty, Result, Segmented, Select, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import type { TimelineRep, TimelineVisit } from '../api/types';
import { describeError, syncedAgo } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import { KIND_COLOR, KIND_LABEL, barBox, dayLabel, hourTicks, lengthText, place } from './timelineMath';
import { timelineKpis } from './targets/targetsMath';

const MARKS = [
  { key: 'start', label: 'Day start', color: '#148ce7' },
  { key: 'last', label: 'Last visit end', color: '#b834f6' },
  { key: 'end', label: 'Day end', color: '#e74c3c' },
] as const;

function VisitTip({ v }: { v: TimelineVisit }) {
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
      <b>{v.client}</b>
      <div>{v.start}{v.end ? ` – ${v.end}` : ''} · {v.end ? lengthText(v.minutes) : 'no end time'}</div>
      <div style={{ opacity: 0.85 }}>{KIND_LABEL[v.kind]}</div>
      {v.history.map((h, i) => (
        <div key={i}>{h.k}{h.a !== undefined ? `: ${h.a.toLocaleString()}` : ''}{h.t ? ` (${h.t})` : ''}</div>
      ))}
    </div>
  );
}

function RepRow({ rep, axis, onOpen }: { rep: TimelineRep; axis: { start: number; end: number }; onOpen: () => void }) {
  const at = (m: number) => `${place(m, axis.start, axis.end)}%`;
  const marks = [
    { ...MARKS[0], minute: rep.start_m, text: rep.start }, { ...MARKS[1], minute: rep.last_m, text: rep.last_visit },
    { ...MARKS[2], minute: rep.end_m, text: rep.day_end },
  ];
  const spanEnd = rep.end_m ?? rep.last_m;
  return (
    <div className="tl-row">
      <button type="button" className="tl-label" onClick={onOpen} title="Show this day in detail">
        <span className="tl-name">{rep.name}</span>
        <span className="tl-sub">{rep.count} {rep.count === 1 ? 'visit' : 'visits'} · {rep.percent}%
          {rep.orders > 0 ? ` · ${rep.orders.toLocaleString()}` : ''}</span>
        <span className="tl-meter"><i style={{ width: `${Math.min(100, rep.percent)}%` }} /></span>
      </button>
      <div className="tl-track">
        {rep.start_m !== null && spanEnd !== null && spanEnd > rep.start_m && (
          <div className="tl-band" style={{ left: at(rep.start_m), width: `${place(spanEnd, axis.start, axis.end) - place(rep.start_m, axis.start, axis.end)}%` }} />
        )}
        {rep.visits.map((v, i) => {
          const box = barBox(v.s, v.e, axis.start, axis.end);
          if (!box) return null;
          return (
            <Tooltip key={i} title={<VisitTip v={v} />} mouseEnterDelay={0.08} placement="top">
              <div className={box.dot ? 'tl-bar tl-dot' : 'tl-bar'} onClick={onOpen}
                style={{ left: `${box.left}%`, width: box.dot ? undefined : `${box.width}%`, background: KIND_COLOR[v.kind] }} />
            </Tooltip>
          );
        })}
        {marks.map((m) => m.minute !== null && (
          <Tooltip key={m.key} title={`${m.label}: ${m.text}`} mouseEnterDelay={0.08}>
            <div className="tl-mark" style={{ left: at(m.minute), background: m.color }} />
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function DayDetail({ rep }: { rep: TimelineRep }) {
  return (
    <>
      <div className="tl-detail-top">
        <div><span className="muted">Visits</span><b>{rep.count}</b></div>
        <div><span className="muted">Work-day share</span><b>{rep.percent}%</b></div>
        <div><span className="muted">Orders</span><b>{rep.orders.toLocaleString()}</b></div>
      </div>
      <div className="tl-steps">
        <div className="tl-step"><i style={{ background: MARKS[0].color }} /><b>{rep.start || '–'}</b><span>Day started</span></div>
        {rep.visits.map((v, i) => (
          <div className="tl-step" key={i}>
            <i style={{ background: KIND_COLOR[v.kind] }} />
            <b>{v.start || '–'}</b>
            <span>
              <strong>{v.client}</strong>
              <em>{v.end ? `${v.start} – ${v.end} · ${lengthText(v.minutes)}` : 'no end time'} · {KIND_LABEL[v.kind]}</em>
              {v.history.length > 0 && (
                <span className="tl-chips">
                  {v.history.map((h, j) => <span className="tl-chip" key={j}>{h.k}{h.a !== undefined ? `: ${h.a.toLocaleString()}` : ''}{h.t ? ` (${h.t})` : ''}</span>)}
                </span>
              )}
            </span>
          </div>
        ))}
        <div className="tl-step"><i style={{ background: MARKS[2].color }} /><b>{rep.day_end || '–'}</b><span>{rep.day_end ? 'Day ended' : 'Day not ended yet'}</span></div>
      </div>
    </>
  );
}

/** Visit Performance Timeline: one lane per sales person and day, with a bar for every visit. Read-only. */
export default function Timeline({ openClassic, classicPath }: { classicPath: string; openClassic: (path: string) => void }) {
  const { api, report, setOffline } = useSession();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [rep, setRep] = useState('');
  const [zoom, setZoom] = useState<'fit' | 'detail'>('fit');
  const [open, setOpen] = useState<{ date: string; rep: TimelineRep } | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000); return () => clearInterval(t); }, []);

  const from = range ? range[0].format('YYYY-MM-DD') : '';
  const to = range ? range[1].format('YYYY-MM-DD') : '';
  const q = useQuery({
    queryKey: ['report', 'visit_timeline', from, to, rep],
    queryFn: () => api.fetchReport('visit_timeline', { from, to, rep }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  const data = q.data?.data;
  const totals = useMemo(() => {
    const days = data?.timeline.days ?? [];
    const reps = days.flatMap((d) => d.reps);
    return { lanes: reps.length, visits: reps.reduce((a, r) => a + r.count, 0), orders: reps.reduce((a, r) => a + r.orders, 0) };
  }, [data]);

  if (q.isPending) return <StillLoading />;
  if (q.isError && !q.data) {
    const d = describeError(asAppError(q.error));
    return (
      <Result status="warning" title={d.title} subTitle={d.text}
        extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
          <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />
    );
  }
  const { data: p, source, saved_at } = q.data!;
  const t = p.timeline;
  const axis = { start: t.axis_start, end: t.axis_end };
  const hours = Math.max(1, (axis.end - axis.start) / 60);
  const ticks = hourTicks(axis.start, axis.end);
  const problem = q.isError ? describeError(asAppError(q.error)) : null;

  return (
    <>
      <div className="page-title">
        <h2>{p.title}</h2>
        <span className="muted">{source === 'offline' ? `Saved copy from ${syncedAgo(saved_at, now)}` : `Synced ${syncedAgo(saved_at, now)}`}</span>
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <MoreMenu items={[{ key: 'classic', label: 'Live view and export in classic window', onClick: () => openClassic(classicPath) }]} />
      </div>
      {source === 'offline' && (
        <Alert type="warning" showIcon style={{ marginBottom: 14 }} title="You are working offline"
          description="This is the last copy saved on this computer. Dates and sales people you have not opened before are not available." />
      )}
      {problem && <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={problem.title} description={problem.text} />}
      <div className="filters">
        <DatePicker.RangePicker allowClear={false} value={range ?? [dayjs(p.from), dayjs(p.to)]}
          onChange={(v) => { if (v && v[0] && v[1]) setRange([v[0], v[1]]); }} />
        <Select showSearch allowClear placeholder="All sales people" style={{ minWidth: 240 }} value={rep || undefined}
          optionFilterProp="label" options={p.users.map((u) => ({ value: u.code, label: `${u.name} (${u.code})` }))}
          onChange={(v) => setRep(v ?? '')} />
        <Segmented value={zoom} onChange={(v) => setZoom(v as 'fit' | 'detail')}
          options={[{ value: 'fit', label: 'Fit to window' }, { value: 'detail', label: 'Detailed' }]} />
      </div>
      {(() => {
        const k = timelineKpis(p);
        return (
          <div className="game-strip">
            <div><div className="l">Visits</div><div className="v">{k.visits.toLocaleString()}<small>{totals.lanes} person-days</small></div></div>
            <div><div className="l">Time with customers</div><div className="v">{lengthText(k.minutes)}<small>avg {k.avgVisit} min</small></div></div>
            <div><div className="l">Work-day use</div><div className="v">{k.workPct}%<small>of office hours</small></div></div>
            <div><div className="l">First visit (average)</div><div className="v">{k.firstVisit}</div></div>
            <div><div className="l">Gaps over 90 min</div><div className="v">{k.gaps}<small>{totals.orders ? `orders ${totals.orders.toLocaleString()}` : ''}</small></div></div>
          </div>
        );
      })()}
      <div className="tl-legend">
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
          <span key={k}><i style={{ background: KIND_COLOR[k] }} />{KIND_LABEL[k]}</span>
        ))}
        {MARKS.map((m) => <span key={m.key}><i className="tl-legend-mark" style={{ background: m.color }} />{m.label}</span>)}
      </div>
      <div className="muted" style={{ marginBottom: 10 }}>
        Work-day share is the time spent in visits out of {t.office_start} to {t.office_end}. Click a name or a bar for the full day.
      </div>
      {t.days.length === 0 && <Empty description="No visits or attendance in this period." style={{ marginTop: 40 }} />}
      {t.days.map((day) => (
        <section className="tl-day" key={day.date}>
          <header className="tl-day-head"><b>{dayLabel(day.date)}</b><span className="muted">{day.reps.length} {day.reps.length === 1 ? 'sales person' : 'sales people'}</span></header>
          <div className="tl-scroll">
            <div className="tl-grid" style={{ ['--tl-track' as string]: zoom === 'detail' ? `${Math.round(hours * 150)}px` : '640px' }}>
              <div className="tl-row tl-axis">
                <div className="tl-label tl-corner" />
                <div className="tl-track">
                  {ticks.map((k) => (
                    <div key={k.minute} className="tl-tick" style={{ left: `${place(k.minute, axis.start, axis.end)}%` }}>{k.label}</div>
                  ))}
                </div>
              </div>
              {day.reps.map((r) => (
                <div className="tl-lane" key={r.code + r.name} style={{ ['--tl-lines' as string]: `${(60 / (axis.end - axis.start)) * 100}%` }}>
                  <RepRow rep={r} axis={axis} onOpen={() => setOpen({ date: day.date, rep: r })} />
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
      <Drawer open={!!open} onClose={() => setOpen(null)} size={Math.min(460, window.innerWidth)}
        title={open ? `${open.rep.name} · ${dayLabel(open.date)}` : ''}>
        {open && <DayDetail rep={open.rep} />}
      </Drawer>
    </>
  );
}
