import MoreMenu from '../ui/MoreMenu';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Dropdown, Input, Result, Select, Space, Tag, Tooltip } from 'antd';
import { MoreOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppError, PipelineAction, PipelineBoard, PipelineBoardCard, PipelinePayload, ProspectKind } from '../api/types';
import { describeError, syncedAgo } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import { cardDetails, filterCards, filterChoices, moveCard, textOn, type BoardFilter } from '../dashboard/pipeline';
import StagesDrawer from './pipeline/StagesDrawer';
import ProspectDrawer from './pipeline/ProspectDrawer';
import ConvertDrawer from './pipeline/ConvertDrawer';

const KIND_TAG: Record<string, { color: string; label: string }> = { customer: { color: 'blue', label: 'Customer' }, doctor: { color: 'green', label: 'Doctor' } };
const READ_ONLY = { move: false, stages: false, create: false, customer: false, doctor: false };

/** The read-only board an older server (or the saved offline copy) gives, in the editable board's shape. */
function fromReport(p: PipelinePayload): PipelineBoard {
  return {
    ...p, stages: p.stages.map((s) => ({ ...s, cards: s.cards.map((c) => ({ ...c, kind: '' as ProspectKind, converted_code: '', converted_kind: '' as ProspectKind })) })),
    stage_names: p.stages.map((s) => s.stage), stage_counts: Object.fromEntries(p.stages.map((s) => [s.stage, s.cards.length])),
    orphans: [], activities: {}, won_stage: '', can: READ_ONLY,
  };
}

/**
 * Pipeline Dashboard: stage columns with the prospects in each. People allowed to change it can drag a card to another
 * stage (or use its menu), manage stages and activities, add prospects as customers or doctors, and turn a prospect into
 * a customer or doctor. Every change runs the web page's own save on the server (src/desktop_api/pipeline_edit.py).
 * With an older server, or offline, the board is the read-only copy.
 */
export default function PipelinePage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report, setOffline } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<BoardFilter>({ rep: '', kind: 'any', category: '' });
  const [local, setLocal] = useState<PipelineBoard | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [convert, setConvert] = useState<{ card: PipelineBoardCard; kind: 'customer' | 'doctor' } | null>(null);
  const [orphanTarget, setOrphanTarget] = useState<string>('');
  useEffect(() => { const t = setTimeout(() => setSearch(typed), 350); return () => clearTimeout(t); }, [typed]);

  // the editable board first; an older server ("unsupported") or no connection gives the read-only report
  const live = useQuery({ queryKey: ['pipeline', search], queryFn: () => api.fetchPipeline(search), placeholderData: keepPreviousData, retry: false });
  const fallbackNeeded = live.isError && ['unsupported', 'offline', 'timeout', 'network_error'].includes(asAppError(live.error).code);
  const old = useQuery({ queryKey: ['report', 'pipeline', search], queryFn: () => api.fetchReport('pipeline', { search }), enabled: fallbackNeeded, placeholderData: keepPreviousData });
  useEffect(() => { if (live.data) { setOffline(false); setLocal(null); } }, [live.data, setOffline]);
  useEffect(() => { if (old.data) setOffline(old.data.source === 'offline'); }, [old.data, setOffline]);
  useEffect(() => { if (live.error && !fallbackNeeded) report(live.error); }, [live.error, fallbackNeeded, report]);
  useEffect(() => { if (old.error) report(old.error); }, [old.error, report]);

  const board: PipelineBoard | null = local ?? live.data ?? (old.data ? fromReport(old.data.data as unknown as PipelinePayload) : null);
  const readOnly = !live.data;
  const can = readOnly ? READ_ONLY : board?.can ?? READ_ONLY;
  const choices = useMemo(() => (board ? filterChoices(board) : { reps: [], categories: [] }), [board]);
  const refresh = useCallback(() => { setLocal(null); void qc.invalidateQueries({ queryKey: ['pipeline'] }); }, [qc]);

  const run = useCallback(async (body: PipelineAction, quiet = false) => {
    try {
      const res = await api.pipelineAct(body);
      if (!res.ok) { void message.error(res.message || 'Not saved.'); refresh(); return null; }
      if (!quiet) void message.success(res.message || 'Saved.');
      return res;
    } catch (e) {
      const err = asAppError(e) as AppError;
      const d = describeError(err);
      void message.error(err.message && err.code !== 'unknown' ? err.message : `${d.title}. ${d.text}`);
      report(e);
      refresh();
      return null;
    }
  }, [api, message, refresh, report]);

  const move = useCallback(async (card: PipelineBoardCard, to: string) => {
    if (!board || card.stage === to) return;
    setLocal(moveCard(board, card.key, to));
    const res = await run({ action: 'move', key: card.key, stage: to, from: card.stage }, true);
    if (!res) return;
    const back = card.stage;
    void message.open({
      type: 'success', duration: 6, key: `move-${card.key}`,
      content: <span>Moved “{card.name}” to “{to}”. <Button size="small" type="link" onClick={() => {
        message.destroy(`move-${card.key}`);
        void run({ action: 'move', key: card.key, stage: back, from: to }).then(refresh);
      }}>Undo</Button></span>,
    });
    refresh();
    const kind = card.kind || card.converted_kind;
    if (to === board.won_stage && !card.converted_code && ((kind !== 'doctor' && can.customer) || (kind === 'doctor' && can.doctor))) {
      setConvert({ card: { ...card, stage: to }, kind: kind === 'doctor' ? 'doctor' : 'customer' });
    }
  }, [board, run, message, refresh, can]);

  if ((live.isPending && !fallbackNeeded) || (fallbackNeeded && old.isPending)) return <StillLoading />;
  if (!board) {
    const d = describeError(asAppError(old.error ?? live.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => { void live.refetch(); }}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  const stages = board.stages;
  const savedAt = old.data?.saved_at;
  const kindFilter = filter.kind;

  const cardMenu = (c: PipelineBoardCard) => {
    const items = [] as { key: string; label: string; disabled?: boolean; children?: { key: string; label: string }[] }[];
    if (can.move) {
      items.push({ key: 'move', label: 'Move to', children: board.stage_names.filter((s) => s !== c.stage).map((s) => ({ key: `to:${s}`, label: s })) });
      if (!c.converted_code) items.push({ key: 'kind:customer', label: 'Mark as customer', disabled: c.kind === 'customer' },
        { key: 'kind:doctor', label: 'Mark as doctor', disabled: c.kind === 'doctor' });
    }
    if (!c.converted_code) {
      if (can.customer) items.push({ key: 'convert:customer', label: 'Convert to customer…' });
      if (can.doctor) items.push({ key: 'convert:doctor', label: 'Convert to doctor…' });
    }
    return items;
  };
  const onMenu = (c: PipelineBoardCard, key: string) => {
    if (key.startsWith('to:')) void move(c, key.slice(3));
    else if (key.startsWith('kind:')) void run({ action: 'kind', key: c.key, kind: key.slice(5) as ProspectKind }).then(refresh);
    else if (key.startsWith('convert:')) setConvert({ card: c, kind: key.slice(8) as 'customer' | 'doctor' });
  };

  return (
    <>
      <div className="page-title">
        <h2>{board.title}</h2>
        <span className="muted">{board.total.toLocaleString()} prospects</span>
        <span className="muted">{old.data?.source === 'offline' && savedAt ? `Saved copy from ${syncedAgo(savedAt, Math.floor(Date.now() / 1000))}` : 'Synced just now'}</span>
        {can.create && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setNewOpen(true)}>New prospect</Button>}
        {can.stages && <Button size="small" icon={<SettingOutlined />} onClick={() => setStagesOpen(true)}>Stages</Button>}
        <Button size="small" icon={<ReloadOutlined />} loading={live.isFetching || old.isFetching} onClick={refresh}>Refresh</Button>
        <MoreMenu items={[{ key: 'classic', label: 'Open in classic window', onClick: () => openClassic(classicPath) }]} />
      </div>
      {readOnly && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          title={fallbackNeeded && asAppError(live.error).code === 'unsupported'
            ? 'This server does not have pipeline editing yet, so the board is read-only. Changes can be made in the classic window.'
            : 'No connection: this is the saved board, read-only.'} />
      )}
      <div className="filters">
        <Input.Search allowClear placeholder="Search prospects" style={{ maxWidth: 260 }} value={typed}
          onChange={(e) => setTyped(e.target.value)} onSearch={setSearch} />
        <Select style={{ minWidth: 150 }} value={filter.rep} onChange={(rep) => setFilter({ ...filter, rep })}
          options={[{ value: '', label: 'Rep: All' }, ...choices.reps.map((r) => ({ value: r, label: r }))]} />
        {!readOnly && <Select style={{ minWidth: 170 }} value={kindFilter} onChange={(kind) => setFilter({ ...filter, kind })}
          options={[{ value: 'any', label: 'Type: All' }, { value: 'customer', label: 'Customers' }, { value: 'doctor', label: 'Doctors' }, { value: 'none', label: 'Type not set' }]} />}
        <Select style={{ minWidth: 150 }} value={filter.category} onChange={(category) => setFilter({ ...filter, category })}
          options={[{ value: '', label: 'Category: All' }, ...choices.categories.map((c) => ({ value: c, label: c }))]} />
      </div>
      {readOnly && board.hidden > 0 && !search && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          title={`${board.hidden} prospect(s) are in a stage that is no longer in the pipeline settings, so they have no column (as on the web).`} />
      )}
      {!readOnly && board.orphans.map((o) => (
        <Alert key={o.stage} type="warning" showIcon style={{ marginBottom: 12 }}
          title={`${o.count} prospect(s) are in “${o.stage || '(no stage)'}”, which is no longer a stage, so they have no column.`}
          action={<Space wrap>
            {can.stages && o.stage && <Button size="small" onClick={() => void run({ action: 'stages', base: board.stage_names, stages: [...board.stage_names, o.stage] }).then(refresh)}>
              Add “{o.stage}” back as a stage</Button>}
            {can.move && board.stage_names.length > 0 && <>
              <Select size="small" style={{ minWidth: 140 }} placeholder="Move them to…" value={orphanTarget || undefined} onChange={setOrphanTarget}
                options={board.stage_names.map((s) => ({ value: s, label: s }))} />
              <Button size="small" disabled={!orphanTarget} onClick={() => void run({ action: 'move_all', from: o.stage, to: orphanTarget }).then(refresh)}>Move</Button>
            </>}
          </Space>} />
      ))}
      {stages.length === 0 ? (
        <Result status="info" title="No pipeline stages yet"
          subTitle={can.stages ? 'Add the first stages to start the board.' : 'Ask someone who manages Pipeline settings to add the stages.'}
          extra={can.stages ? <Button type="primary" icon={<SettingOutlined />} onClick={() => setStagesOpen(true)}>Add stages</Button> : undefined} />
      ) : (
        <div className="pipeline-board" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
          {stages.map((s) => {
            const cards = filterCards(s.cards, readOnly ? { ...filter, kind: 'any' } : filter);
            const dropping = can.move && dragKey && overStage === s.stage;
            return (
              <section key={s.stage} className="panel flush" aria-label={`Stage ${s.stage}`}
                style={{ minWidth: 220, flex: '1 0 220px', maxHeight: 'calc(100vh - 250px)', display: 'flex', flexDirection: 'column',
                  outline: dropping ? '2px dashed var(--ant-color-primary, #c76a12)' : undefined }}
                onDragOver={can.move ? (e) => { e.preventDefault(); setOverStage(s.stage); } : undefined}
                onDragLeave={can.move ? () => setOverStage((o) => (o === s.stage ? null : o)) : undefined}
                onDrop={can.move ? (e) => {
                  e.preventDefault(); setOverStage(null);
                  const key = e.dataTransfer.getData('text/plain') || dragKey;
                  const card = stages.flatMap((x) => x.cards).find((c) => c.key === key);
                  setDragKey(null);
                  if (card) void move(card, s.stage);
                } : undefined}>
                <div style={{ background: s.color || undefined, color: textOn(s.color), padding: '8px 12px', fontWeight: 600, borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{s.stage}{s.stage === board.won_stage && <Tag style={{ marginLeft: 6 }}>converts</Tag>}</span><span>{cards.length}</span>
                </div>
                <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
                  {cards.length === 0 && <div className="muted" style={{ textAlign: 'center', padding: '24px 0', fontStyle: 'italic' }}>{dropping ? 'Drop here' : 'No items'}</div>}
                  {cards.map((c) => {
                    const details = cardDetails(c);
                    const items = cardMenu(c);
                    const kind = c.converted_kind || c.kind;
                    const body = (
                      <div className="pipeline-card" draggable={can.move}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.key); e.dataTransfer.effectAllowed = 'move'; setDragKey(c.key); }}
                        onDragEnd={() => { setDragKey(null); setOverStage(null); }}
                        style={{ borderLeft: `4px solid ${c.border || 'transparent'}`, padding: '8px 10px', borderRadius: 8, cursor: can.move ? 'grab' : undefined,
                          background: 'var(--card-bg, rgba(127,127,127,.06))', opacity: dragKey === c.key ? 0.5 : 1 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <div style={{ fontWeight: 600, flex: 1 }}>{c.name}</div>
                          {items.length > 0 && (
                            <Dropdown trigger={['click']} menu={{ items, onClick: ({ key }) => onMenu(c, String(key)) }}>
                              <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`Actions for ${c.name}`} onClick={(e) => e.stopPropagation()} />
                            </Dropdown>
                          )}
                        </div>
                        {c.rep && <div className="muted" style={{ fontSize: 12 }}>{c.rep}</div>}
                        <div style={{ marginTop: 4 }}>
                          {kind && <Tag color={KIND_TAG[kind]?.color}>{KIND_TAG[kind]?.label}</Tag>}
                          {c.converted_code && <Tag color="success">Converted → {c.converted_code}</Tag>}
                        </div>
                      </div>
                    );
                    return details.length
                      ? <Tooltip key={c.key} placement="right" mouseEnterDelay={0.6} title={<div>{details.map(([k, v]) => <div key={k}><b>{k}:</b> {v}</div>)}</div>}>{body}</Tooltip>
                      : <div key={c.key}>{body}</div>;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {stagesOpen && <StagesDrawer board={board} onClose={() => setStagesOpen(false)} run={run} refresh={refresh} />}
      {newOpen && <ProspectDrawer board={board} onClose={() => setNewOpen(false)} onSaved={refresh} />}
      {convert && <ConvertDrawer card={convert.card} kind={convert.kind} onClose={() => setConvert(null)} onSaved={refresh} />}
    </>
  );
}
