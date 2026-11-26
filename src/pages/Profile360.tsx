import { useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, DatePicker, Drawer, Empty, Input, Result, Segmented, Select, Skeleton, Space, Tag, Timeline, Tooltip } from 'antd';
import {
  EditOutlined, EnvironmentOutlined, MailOutlined, MessageOutlined, PhoneOutlined, ReloadOutlined, SendOutlined, WhatsAppOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileKind, TimelineEntry } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { DATE_FMT, showDate } from '../ui/dates';
import { encodeStrict } from '../dashboard/share';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const money = (n: unknown) => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
/** Kenyan numbers as WhatsApp wants them: 07xx -> 2547xx. */
export const waNumber = (phone: string) => {
  const d = phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
  return d.startsWith('0') ? `254${d.slice(1)}` : d;
};
const COLORS: Record<string, string> = { visits: 'blue', orders: 'green', payments: 'gold', feedback: 'volcano', expiry: 'purple',
  detailing: 'cyan', samples: 'geekblue', gifts: 'magenta', meetings: 'lime', touches: 'gray' };

function line(e: TimelineEntry): string {
  switch (e.type) {
    case 'visits': return [e.rep, e.time && `${e.time}${e.end ? ` to ${e.end}` : ''}`, Number(e.order) ? `order ${money(e.order)}` : '', e.remarks].filter(Boolean).join(' · ');
    case 'orders': return [e.number, money(e.amount), e.status, e.cancel ? 'cancelled' : ''].filter(Boolean).join(' · ');
    case 'payments': return [money(e.amount), e.mode, e.rep, e.remarks].filter(Boolean).join(' · ');
    case 'feedback': return [e.ftype, e.kind, e.status, e.remarks].filter(Boolean).join(' · ');
    case 'detailing': case 'gifts': return [e.rep, (e.products as string[] | undefined)?.join(', '), e.remarks].filter(Boolean).join(' · ');
    case 'samples': return [e.rep, (e.products as [string, number][] | undefined)?.map(([n, q]) => `${n} x${q}`).join(', ')].filter(Boolean).join(' · ');
    case 'meetings': return [e.status, e.agenda, e.purpose].filter(Boolean).join(' · ');
    case 'touches': return [s(e.channel).replace('_', ' '), e.rep && `to ${e.rep}`, e.note, e.by && `by ${e.by}`].filter(Boolean).join(' · ');
    default: return s(e.remarks);
  }
}

/** The 360 degree view of one customer or doctor, with touch base. */
export default function Profile360({ kind, recordKey, onClose, onEdit }: {
  kind: ProfileKind; recordKey: string | null; onClose: () => void; onEdit?: () => void;
}) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profile', kind, recordKey], queryFn: () => api.fetchProfile(kind, recordKey!), enabled: !!recordKey, staleTime: 30_000 });
  const [filter, setFilter] = useState('all');
  const [touch, setTouch] = useState<{ channel: string; note: string; rep?: string; when?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const p = q.data;
  const m = (p?.master ?? {}) as Record<string, unknown>;
  const phone = s(m.p || m.m || m.ph);
  const email = s(m.em || m.e);
  const geo = s(m.gc);
  const shown = useMemo(() => (p?.timeline ?? []).filter((e) => filter === 'all' || e.type === filter).slice(0, 150), [p, filter]);

  const open = (url: string) => api.openContact(url).catch((e) => { const d = describeError(asAppError(e)); void message.error(d.text); });
  const log = async (channel: string, note = '', extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const r = await api.touchBase(kind, { key: q.data?.key || recordKey!, channel, note, request_id: newId(), ...extra });
      if (r.ok) { void message.success(r.message); setTouch(null); await qc.invalidateQueries({ queryKey: ['profile', kind, recordKey] }); }
      else void message.error(r.message);
    } catch (e) { const d = describeError(asAppError(e)); void message.error(`${d.title}. ${d.text}`); report(e); } finally { setBusy(false); }
  };
  const quick = (channel: 'call' | 'whatsapp' | 'email') => {
    if (channel === 'call' && phone) void open(`tel:${phone.replace(/[^\d+]/g, '')}`);
    if (channel === 'whatsapp' && phone) void open(`https://wa.me/${waNumber(phone)}?text=${encodeStrict(`Hello ${s(m.n)},`)}`);
    if (channel === 'email' && email) void open(`mailto:${encodeURIComponent(email).replace('%40', '@')}`);
    setTouch({ channel, note: '' });
  };

  const f = p?.figures as Record<string, unknown> | undefined;
  const cards = !f ? [] : kind === 'customer' ? [
    ['Visits 30 days', f.visits_30], ['Visits 90 days', f.visits_90], ['Orders 90 days', f.orders_90], ['Order value 90 days', money(f.order_value_90)],
    ['Average order', money(f.avg_order)], ['Collected 90 days', money(f.collected_90)], ['Open feedback', f.open_feedback],
  ] : [
    ['Visits 30 days', f.visits_30], ['Visits 90 days', f.visits_90], ['Detailing 90 days', f.detailing_90], ['Samples 90 days', f.samples_90],
    ['Gifts 90 days', f.gifts_90], ['Next meeting', String(showDate(f.next_meeting) || 'None')],
  ];
  const maxWeek = Math.max(1, ...(p?.figures.weeks ?? []).map((w) => w.visits));

  return (
    <Drawer open={!!recordKey} onClose={onClose} size={Math.min(1100, window.innerWidth)} destroyOnHidden
      title={p ? <span className="p360-title">{s(m.n)} <Tag bordered={false}>{s(m.c)}</Tag></span> : 'Loading...'}
      extra={<Space>
        <Button icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        {onEdit && <Button icon={<EditOutlined />} onClick={onEdit}>Edit details</Button>}
      </Space>}>
      {q.isPending && <Skeleton active paragraph={{ rows: 12 }} />}
      {q.isError && <Result status="warning" title={describeError(asAppError(q.error)).title} subTitle={describeError(asAppError(q.error)).text}
        extra={<Button icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>} />}
      {p && (
        <div className="p360">
          <section className="p360-card">
            <div className="p360-who">
              <div className="p360-avatar">{s(m.n).trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
              <div>
                <h2>{s(m.n)}</h2>
                <div className="muted">{[kind === 'doctor' ? s(m.sp) : s(m.category), s(m.h), s(m.a), s(m.rt)].filter(Boolean).join(' · ')}</div>
                <div className="p360-contact">
                  {phone && <span><PhoneOutlined /> {phone}</span>}
                  {email && <span><MailOutlined /> {email}</span>}
                  {s(m.ad || m.add) && <span><EnvironmentOutlined /> {s(m.ad || m.add)}</span>}
                  {kind === 'customer' && s(m.pr) && <span>Contact: {s(m.pr)}</span>}
                </div>
              </div>
            </div>
            <div className="p360-touch">
              <span className="muted">Touch base</span>
              <Tooltip title={phone ? 'Call, then note what was said' : 'No phone number saved'}><Button icon={<PhoneOutlined />} disabled={!phone} onClick={() => quick('call')}>Call</Button></Tooltip>
              <Tooltip title={phone ? 'Open a WhatsApp chat' : 'No phone number saved'}><Button icon={<WhatsAppOutlined />} disabled={!phone} onClick={() => quick('whatsapp')}>WhatsApp</Button></Tooltip>
              <Tooltip title={email ? 'Write an email' : 'No email saved'}><Button icon={<MailOutlined />} disabled={!email} onClick={() => quick('email')}>Email</Button></Tooltip>
              <Button icon={<MessageOutlined />} onClick={() => setTouch({ channel: 'note', note: '' })}>Note</Button>
              <Button type="primary" icon={<SendOutlined />} onClick={() => setTouch({ channel: 'visit_request', note: '' })}>Ask a rep to visit</Button>
              {geo && <Button type="link" icon={<EnvironmentOutlined />} onClick={() => void open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(geo).replace(/%2C/g, ',')}`)}>Map</Button>}
            </div>
            {touch && (
              <div className="p360-touchform">
                {touch.channel === 'visit_request' ? (
                  <Space wrap>
                    <Select showSearch placeholder="Which rep" style={{ width: 240 }} value={touch.rep} optionFilterProp="label"
                      onChange={(v: string) => setTouch({ ...touch, rep: v })}
                      options={p.reps.map((r) => ({ value: r.key, label: `${r.name} (${r.code})${r.notify ? '' : ' - no app sign-in'}`, disabled: !r.notify }))} />
                    <DatePicker format={DATE_FMT} placeholder="By (optional)" onChange={(d) => setTouch({ ...touch, when: d ? d.format('ddd DD-MM') : undefined })} />
                  </Space>
                ) : <div className="muted">{touch.channel === 'note' ? 'Add a note' : `How did the ${touch.channel} go? Log it so the team can see it.`}</div>}
                <Input.TextArea autoFocus autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1000} placeholder={touch.channel === 'visit_request' ? 'What should the rep do there?' : 'What was discussed'}
                  value={touch.note} onChange={(e) => setTouch({ ...touch, note: e.target.value })} />
                <Space>
                  <Button onClick={() => setTouch(null)}>Cancel</Button>
                  <Button type="primary" loading={busy} disabled={(touch.channel === 'note' && !touch.note.trim()) || (touch.channel === 'visit_request' && !touch.rep)}
                    onClick={() => void log(touch.channel, touch.note, touch.channel === 'visit_request' ? { rep: touch.rep, when: touch.when } : {})}>
                    {touch.channel === 'visit_request' ? 'Send to rep' : 'Log it'}
                  </Button>
                </Space>
              </div>
            )}
          </section>

          <section className="p360-figs">
            {cards.map(([label, value]) => <div key={s(label)} className="p360-fig"><span>{s(label)}</span><b>{s(value)}</b></div>)}
          </section>

          <div className="p360-cols">
            <section className="p360-box">
              <h4>Visits per week</h4>
              <div className="p360-weeks">
                {p.figures.weeks.map((w) => (
                  <Tooltip key={w.week} title={`Week of ${showDate(w.week)}: ${w.visits} visits`}>
                    <div className="p360-week"><i style={{ height: `${(w.visits / maxWeek) * 100}%` }} /><small>{w.week.slice(8, 10)}/{w.week.slice(5, 7)}</small></div>
                  </Tooltip>
                ))}
              </div>
              <div className="muted">Last visit: {String(showDate(p.figures.last_visit) || 'never')}{p.figures.reps.length ? ` · reps in the last 90 days: ${p.figures.reps.join(', ')}` : ''}</div>
              <h4 style={{ marginTop: 16 }}>{kind === 'customer' ? 'Most ordered (90 days)' : 'Most detailed (90 days)'}</h4>
              {p.figures.top_products.length ? p.figures.top_products.map((t) => (
                <div key={t.name} className="p360-top"><span>{t.name}</span><b>{t.qty.toLocaleString()}</b></div>
              )) : <div className="muted">Nothing yet</div>}
            </section>
            <section className="p360-box grow">
              <div className="p360-tl-head">
                <h4>Timeline</h4>
                <Segmented size="small" value={filter} onChange={(v) => setFilter(String(v))}
                  options={[{ value: 'all', label: 'All' }, ...Object.entries(p.counts).filter(([, n]) => n).map(([k, n]) => ({ value: k, label: `${k[0].toUpperCase()}${k.slice(1)} ${n}` }))]} />
              </div>
              {shown.length ? (
                <Timeline className="p360-tl" items={shown.map((e) => ({
                  color: COLORS[e.type] ?? 'gray',
                  children: <div><b>{e.label}</b> <span className="muted">{String(showDate(e.date) ?? '')}</span><div>{line(e)}</div></div>,
                }))} />
              ) : <Empty description="Nothing recorded yet" />}
              {(p.timeline.length >= 240) && <Alert type="info" showIcon title="Showing the most recent records." />}
            </section>
          </div>
        </div>
      )}
    </Drawer>
  );
}
