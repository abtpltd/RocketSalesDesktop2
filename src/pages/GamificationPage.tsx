import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, DatePicker, Empty, InputNumber, Result, Segmented, Select, Switch, Table, Tooltip } from 'antd';
import {
  CaretDownFilled, CaretUpFilled, ClockCircleOutlined, CreditCardOutlined, EnvironmentOutlined, LeftOutlined, MessageOutlined,
  ReloadOutlined, RightOutlined, SaveOutlined, ShoppingCartOutlined, TagsOutlined, TrophyOutlined, UndoOutlined, UserAddOutlined,
} from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { GameBoardPayload, GameMonthPayload, GameRep, GameRulesPayload } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import KasChart from '../dashboard/KasChart';
import { FullView, MaximiseButton } from '../dashboard/DashParts';
import ExportButton from '../ui/ExportButton';
import { fileName } from '../ui/excel';

type Tab = 'board' | 'month' | 'rules';
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const n = (v: number) => v.toLocaleString();
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const MEDAL = ['#d4a017', '#8d99a6', '#b8723d'];

/** Gamification: Leaderboard, Monthly points and Points rules for the field app's points. */
export default function GamificationPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const [tab, setTab] = useState<Tab>('board');
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [manager, setManager] = useState('');
  const thisMonth = dayjs().format('YYYY-MM');
  return (
    <div className="game">
      <div className="page-title">
        <h2>Gamification</h2>
        <Segmented value={tab} onChange={(v) => setTab(v as Tab)}
          options={[{ value: 'board', label: <span><TrophyOutlined /> Leaderboard</span> }, { value: 'month', label: 'Monthly points' }, { value: 'rules', label: 'Points rules' }]} />
        <span className="spacer" />
        {tab !== 'rules' && (
          <>
            <Button icon={<LeftOutlined />} aria-label="Previous month" onClick={() => setMonth((m) => dayjs(`${m}-01`).subtract(1, 'month').format('YYYY-MM'))} />
            <DatePicker picker="month" allowClear={false} value={dayjs(`${month}-01`)} format="MMMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'month')}
              onChange={(v) => { if (v) setMonth(v.format('YYYY-MM')); }} />
            <Button icon={<RightOutlined />} aria-label="Next month" disabled={month >= thisMonth}
              onClick={() => setMonth((m) => dayjs(`${m}-01`).add(1, 'month').format('YYYY-MM'))} />
          </>
        )}
      </div>
      {tab === 'board' && <Board month={month} manager={manager} setManager={setManager} classicPath={classicPath} openClassic={openClassic} />}
      {tab === 'month' && <Month month={month} manager={manager} setManager={setManager} classicPath={classicPath} openClassic={openClassic} />}
      {tab === 'rules' && <Rules classicPath={classicPath} openClassic={openClassic} />}
    </div>
  );
}

function Problem({ error, retry, classicPath, openClassic }: { error: unknown; retry: () => void; classicPath: string; openClassic: (p: string) => void }) {
  const d = describeError(asAppError(error));
  return <Result status="warning" title={d.title} subTitle={d.text}
    extra={[<Button key="r" icon={<ReloadOutlined />} onClick={retry}>Try again</Button>,
      <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
}

function ManagerFilter({ reps, value, onChange }: { reps: { manager: string }[]; value: string; onChange: (v: string) => void }) {
  const managers = useMemo(() => [...new Set(reps.map((r) => r.manager).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [reps]);
  if (!managers.length) return null;
  return <Select allowClear showSearch placeholder="All managers" style={{ minWidth: 200 }} value={value || undefined}
    options={managers.map((m) => ({ value: m, label: m }))} onChange={(v) => onChange(v ?? '')} aria-label="Manager" />;
}

// ---- Leaderboard ----
function Board({ month, manager, setManager, classicPath, openClassic }: { month: string; manager: string; setManager: (v: string) => void; classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const q = useQuery({ queryKey: ['report', 'gamification', 'board', month], queryFn: () => api.fetchReport('gamification', { from: month, kind: 'board' }), placeholderData: keepPreviousData });
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  if (q.isPending) return <StillLoading />;
  if (q.isError && !q.data) return <Problem error={q.error} retry={() => void q.refetch()} classicPath={classicPath} openClassic={openClassic} />;
  const p = q.data!.data as unknown as GameBoardPayload;
  const all = p.rows as unknown as GameRep[];
  const reps = manager ? all.filter((r) => r.manager === manager) : all;
  const s = p.stats;
  const best = Math.max(1, ...reps.map((r) => r.score));
  const sel = reps.find((r) => r.code === picked) ?? reps[0];
  const podium = reps.slice(0, 3);
  const label = dayjs(`${month}-01`).format('MMMM YYYY');
  if (!all.length) return <Empty description="No active app users." />;
  return (
    <>
      <div className="game-strip">
        <div><div className="l">Reps taking part</div><div className="v">{n(manager ? reps.length : s.reps)}</div></div>
        <div><div className="l">Total points</div><div className="v">{n(manager ? reps.reduce((a, r) => a + r.score, 0) : s.points)}</div></div>
        <div><div className="l">Average per rep</div><div className="v">{n(manager ? Math.round(reps.reduce((a, r) => a + r.score, 0) / Math.max(1, reps.length)) : s.average)}</div></div>
        <div><div className="l">Top score</div><div className="v">{n(reps[0]?.score ?? 0)}<small>{reps[0]?.score ? reps[0].name : ''}</small></div></div>
        <div><div className="l">Most points from</div><div className="v">{s.best_activity || '–'}{s.best_share ? <small>{s.best_share}% of all points</small> : null}</div></div>
      </div>
      <div className="filters">
        <ManagerFilter reps={all} value={manager} onChange={setManager} />
        <span className="spacer" />
        <ExportButton name={fileName('Gamification leaderboard', label)} sheet="Leaderboard" disabled={!reps.length}
          load={async () => ({
            columns: [{ key: 'rank', title: 'Rank' }, { key: 'name', title: 'Rep' }, { key: 'code', title: 'Code' }, { key: 'manager', title: 'Manager' },
              { key: 'score', title: 'Points' }, { key: 'before', title: 'Rank last month' }, ...reps[0].activities.map((a) => ({ key: `a:${a.title}`, title: a.title }))],
            rows: reps.map((r) => ({ ...r, ...Object.fromEntries(r.activities.map((a) => [`a:${a.title}`, a.points])) })),
          })} />
      </div>
      <div className="game-board">
        <section className="game-card">
          {podium.length > 0 && podium[0].score > 0 && (
            <div className="podium">
              {[1, 0, 2].filter((i) => podium[i]).map((i) => {
                const r = podium[i];
                return (
                  <button key={r.code} type="button" className={`pod${i === 0 ? ' first' : ''}${sel?.code === r.code ? ' sel' : ''}`} onClick={() => setPicked(r.code)}>
                    <span className="medal" style={{ background: MEDAL[i] }}>{i + 1}</span>
                    <span className="ava" style={{ background: MEDAL[i] }}>{initials(r.name)}</span>
                    <b>{r.name}</b><span className="note">{[r.code, r.hq].filter(Boolean).join(', ')}</span>
                    <span className="sc">{n(r.score)}</span>
                    {s.average > 0 && <span className="note">{r.score >= s.average ? `${Math.round((r.score / s.average - 1) * 100)}% above average` : `${Math.round((1 - r.score / s.average) * 100)}% below average`}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="rank-head"><span>Rank</span><span /><span>Rep</span><span>Points against the leader</span><span>Points</span><span>{s.has_before ? 'vs last month' : ''}</span></div>
          <div className="rank-list">
            {reps.map((r) => (
              <button key={r.code} type="button" className={`rank-row${sel?.code === r.code ? ' sel' : ''}`} onClick={() => setPicked(r.code)}>
                <span className="rk">{r.rank}</span>
                <span className="avs">{initials(r.name)}</span>
                <span className="nm"><b>{r.name}</b><small>{[r.code, r.manager].filter(Boolean).join(', ')}</small></span>
                <span className="trk"><span style={{ width: `${(r.score / best) * 100}%` }} /></span>
                <span className="pts">{n(r.score)}</span>
                <span className={`mv ${r.move == null ? 'eq' : r.move > 0 ? 'up' : r.move < 0 ? 'dn' : 'eq'}`}>
                  {r.move == null ? (s.has_before ? 'new' : '') : r.move > 0 ? <><CaretUpFilled /> {r.move}</> : r.move < 0 ? <><CaretDownFilled /> {-r.move}</> : '–'}
                </span>
              </button>
            ))}
          </div>
        </section>
        {sel && <RepPanel r={sel} of={reps.length} />}
      </div>
    </>
  );
}

function RepPanel({ r, of }: { r: GameRep; of: number }) {
  const acts = [...r.activities].sort((a, b) => b.points - a.points);
  const top = Math.max(1, ...acts.map((a) => a.points));
  const pie = acts.filter((a) => a.points > 0).slice(0, 7);
  return (
    <aside className="game-card rep-panel">
      <div className="prof"><span className="ava2">{initials(r.name)}</span><div><h3>{r.name}</h3><div className="dash-sub">Rank {r.rank} of {of}, {n(r.score)} points{r.before ? `, rank ${r.before} last month` : ''}</div></div></div>
      {pie.length > 0
        ? <div className="rep-donut"><KasChart spec={{ kind: 'doughnut', title: 'Points by activity', pairs: pie.map((a) => [a.title, a.points]) }} height={220} /></div>
        : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No points this month" />}
      <div className="rep-acts-title">Where the points came from</div>
      {acts.map((a) => (
        <div key={a.title} className="rep-act"><span>{a.title}</span><span className="trk"><span style={{ width: `${(a.points / top) * 100}%` }} /></span><b>{n(a.points)}</b></div>
      ))}
    </aside>
  );
}

// ---- Monthly points ----
function Month({ month, manager, setManager, classicPath, openClassic }: { month: string; manager: string; setManager: (v: string) => void; classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const q = useQuery({ queryKey: ['report', 'gamification', 'month', month], queryFn: () => api.fetchReport('gamification', { from: month, kind: 'month' }), placeholderData: keepPreviousData });
  const [find, setFind] = useState('');
  const [big, setBig] = useState(false);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  if (q.isPending) return <StillLoading />;
  if (q.isError && !q.data) return <Problem error={q.error} retry={() => void q.refetch()} classicPath={classicPath} openClassic={openClassic} />;
  const p = q.data!.data as unknown as GameMonthPayload;
  const all = p.rows as unknown as Record<string, string | number>[];
  const rows = all.filter((r) => (!manager || r.manager === manager) && (!find || `${r.rep} ${r.code}`.toLowerCase().includes(find.toLowerCase())));
  const numCols = p.columns.filter((c) => c.key !== 'rep' && c.key !== 'code');
  const max = Object.fromEntries(numCols.map((c) => [c.key, Math.max(1, ...rows.map((r) => Number(r[c.key]) || 0))]));
  const label = dayjs(`${month}-01`).format('MMMM YYYY');
  const columns = [
    { title: 'Rep', key: 'rep', dataIndex: 'rep', fixed: 'left' as const, width: 220,
      sorter: (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.rep).localeCompare(String(b.rep)),
      render: (_: unknown, r: Record<string, unknown>) => <span className="mx-rep"><b>{String(r.rep)}</b> <span className="muted">{String(r.code)}</span></span> },
    ...numCols.map((c) => ({
      title: <span className="mx-th">{c.title}</span>, key: c.key, dataIndex: c.key, align: 'center' as const, width: c.key === 'total' ? 80 : 84,
      fixed: c.key === 'total' ? ('right' as const) : undefined,
      defaultSortOrder: c.key === 'total' ? ('descend' as const) : undefined,
      sorter: (a: Record<string, unknown>, b: Record<string, unknown>) => (Number(a[c.key]) || 0) - (Number(b[c.key]) || 0),
      onCell: (r: Record<string, unknown>) => {
        if (c.key === 'total') return { className: 'mx-total' };
        const v = Number(r[c.key]) || 0; const t = v / max[c.key];
        return v ? { className: 'mx-cell', style: { background: `color-mix(in srgb, var(--brand) ${Math.round(6 + t * 52)}%, var(--card))`, color: t > 0.7 ? '#fff' : undefined } } : { className: 'mx-zero' };
      },
    })),
  ];
  const table = (y?: string) => (
    <Table size="small" className="mx-table" rowKey="key" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 'max-content', y }}
      locale={{ emptyText: 'No points recorded this month' }}
      summary={() => rows.length ? (
        <Table.Summary fixed>
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}><b>Total, {rows.length} reps</b></Table.Summary.Cell>
            {numCols.map((c, i) => <Table.Summary.Cell key={c.key} index={i + 1} align="center"><b>{n(rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0))}</b></Table.Summary.Cell>)}
          </Table.Summary.Row>
        </Table.Summary>
      ) : null} />
  );
  const exportBtn = <ExportButton name={fileName('Gamification monthly points', label)} sheet="Monthly points" disabled={!rows.length}
    load={async () => ({ columns: p.columns, rows })} />;
  return (
    <>
      <div className="filters">
        <ManagerFilter reps={all as unknown as { manager: string }[]} value={manager} onChange={setManager} />
        <Select showSearch allowClear placeholder="Find a rep" style={{ minWidth: 220 }} value={find || undefined} onChange={(v) => setFind(v ?? '')}
          options={all.map((r) => ({ value: String(r.rep), label: `${r.rep} (${r.code})` }))} aria-label="Rep" />
        <span className="spacer" />
        <span className="mx-legend">Fewer <i style={{ opacity: 0.25 }} /><i style={{ opacity: 0.55 }} /><i /> More points (each column on its own scale)</span>
        {exportBtn}
        <MaximiseButton onClick={() => setBig(true)} />
      </div>
      <section className="game-card flush">{table('calc(100vh - 330px)')}</section>
      {big && <FullView open={big} onClose={() => setBig(false)} title={`Monthly points, ${label}`} sub={`${rows.length} reps`} extra={exportBtn}>{table('calc(100vh - 240px)')}</FullView>}
    </>
  );
}

// ---- Points rules ----
const GROUPS: { id: string; title: string; sub: string; icon: React.ReactNode }[] = [
  { id: 'discipline', title: 'Daily discipline', sub: 'Being on duty and reachable', icon: <ClockCircleOutlined /> },
  { id: 'visits', title: 'Visits', sub: 'Calls on customers and doctors', icon: <EnvironmentOutlined /> },
  { id: 'selling', title: 'Orders and sales', sub: 'Business written', icon: <ShoppingCartOutlined /> },
  { id: 'care', title: 'Customer care', sub: 'Information brought back', icon: <MessageOutlined /> },
  { id: 'collections', title: 'Collections', sub: 'Money collected', icon: <CreditCardOutlined /> },
  { id: 'growth', title: 'Growth', sub: 'New and verified customers', icon: <UserAddOutlined /> },
];

function Rules({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['setup', 'gamification_rules'], queryFn: () => api.fetchSetup<GameRulesPayload>('gamification_rules'), staleTime: 0 });
  const [values, setValues] = useState<Record<string, number>>({});
  const [groupWise, setGroupWise] = useState(false);
  const [groups, setGroups] = useState<{ name: string; points: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(newId);
  const reset = (p: GameRulesPayload) => { setValues({ ...p.values }); setGroupWise(p.group_wise); setGroups(p.groups.map((g) => ({ ...g }))); };
  useEffect(() => { if (q.data) reset(q.data); }, [q.data]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  if (q.isPending) return <StillLoading />;
  if (q.isError || !q.data) return <Problem error={q.error} retry={() => void q.refetch()} classicPath={classicPath} openClassic={openClassic} />;
  const p = q.data;
  const dirty = JSON.stringify(values) !== JSON.stringify(p.values) || groupWise !== p.group_wise || JSON.stringify(groups) !== JSON.stringify(p.groups);
  const v = (f: string) => Number(values[f] ?? 0);
  // a typical good day: start and end the day, 8 visits with a picture, one order
  const day = v('startDay') + v('endDay') + 8 * (v('visit') + v('visitPicture')) + v('order');
  const save = async () => {
    setSaving(true); setProblem(null);
    try {
      const res = await api.saveSetup('gamification_rules', { request_id: requestId, base: p.base, values, group_wise: groupWise, groups });
      if (!res.ok) { setProblem(res.message || 'Not saved.'); setRequestId(newId()); return; }
      void message.success(res.message || 'Points rules saved'); setRequestId(newId());
      void qc.invalidateQueries({ queryKey: ['setup', 'gamification_rules'] });
    } catch (e) {
      const d = describeError(asAppError(e)); setProblem(`${d.title}. ${d.text}`); setRequestId(newId()); report(e);
    } finally { setSaving(false); }
  };
  return (
    <>
      <div className="game-card rules-preview">
        <div><div className="l">A typical good day earns</div><div className="big">about {n(day)} points</div></div>
        <div className="muted">Start and end the day, 8 visits with a picture and one order. The field app adds points as the rep works; changes count from the next activity.</div>
        <span className="spacer" />
        <Button icon={<UndoOutlined />} disabled={!dirty || saving} onClick={() => reset(p)}>Discard</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={() => void save()}>Save rules</Button>
      </div>
      {problem && <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problem} />}
      <div className="rules-grid">
        {GROUPS.map((g) => (
          <section key={g.id} className="game-card rule-group">
            <header><span className="rg-icon">{g.icon}</span><div><h3>{g.title}</h3><small>{g.sub}</small></div></header>
            {p.rules.filter((r) => r.group === g.id).map((r) => (
              <div key={r.field} className="rule">
                <span>{r.label}</span>
                <InputNumber min={0} max={r.amount ? 10000000 : 100000} precision={0} step={r.amount ? 100 : 1} value={values[r.field] ?? 0}
                  onChange={(x) => setValues((s) => ({ ...s, [r.field]: Number(x ?? 0) }))} style={{ width: r.amount ? 120 : 90 }}
                  addonAfter={r.amount ? 'amount' : 'pts'} aria-label={r.label} />
              </div>
            ))}
          </section>
        ))}
        <section className="game-card rule-group wide">
          <header>
            <span className="rg-icon"><TagsOutlined /></span>
            <div><h3>Visit points by customer group</h3><small>When switched on, a visit earns its customer group's points</small></div>
            <Tooltip title={groupWise ? 'Switched on' : 'Switched off'}><Switch checked={groupWise} onChange={setGroupWise} style={{ marginLeft: 'auto' }} aria-label="Customer group wise visit points" /></Tooltip>
          </header>
          {groups.length ? (
            <div className="group-points">
              {groups.map((g, i) => (
                <div key={g.name} className="rule">
                  <span>{g.name}</span>
                  <InputNumber min={0} max={100000} precision={0} value={g.points} disabled={!groupWise} addonAfter="pts" style={{ width: 120 }}
                    onChange={(x) => setGroups((gs) => gs.map((y, j) => (j === i ? { ...y, points: Number(x ?? 0) } : y)))} aria-label={`${g.name} visit points`} />
                </div>
              ))}
            </div>
          ) : <div className="muted" style={{ padding: 16 }}>No customer groups set up.</div>}
        </section>
      </div>
    </>
  );
}
