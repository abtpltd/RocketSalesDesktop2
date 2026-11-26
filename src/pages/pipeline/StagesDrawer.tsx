import { useMemo, useState } from 'react';
import { Alert, Button, Drawer, Input, Select, Space, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { PipelineAction, PipelineBoard, PipelineResult } from '../../api/types';
import { shift, stageProblem } from '../../dashboard/pipeline';

/**
 * Pipeline stages: add, reorder and remove (only when empty), the stage that offers to convert, and each stage's
 * activities. Saved through the web's Pipeline settings page (one save of the whole list, checked against the list
 * opened here, so a change made meanwhile on the web is not overwritten).
 */
export default function StagesDrawer({ board, onClose, run, refresh }: {
  board: PipelineBoard; onClose: () => void; refresh: () => void;
  run: (body: PipelineAction, quiet?: boolean) => Promise<PipelineResult | null>;
}) {
  const saved = board.stage_names;
  const [list, setList] = useState<string[]>(saved);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actStage, setActStage] = useState(saved[0] ?? '');
  const [activity, setActivity] = useState('');
  const problem = name.trim() ? stageProblem(name, list, saved) : null;
  const changed = useMemo(() => JSON.stringify(list) !== JSON.stringify(saved), [list, saved]);
  const add = () => {
    if (stageProblem(name, list, saved)) return;
    setList([...list, name.split(/\s+/).filter(Boolean).join(' ')]);
    setName('');
  };
  const save = async () => {
    setBusy(true);
    const res = await run({ action: 'stages', base: saved, stages: list });
    setBusy(false);
    if (res) { refresh(); onClose(); }
  };

  return (
    <Drawer open onClose={onClose} title="Pipeline stages" size={Math.min(560, window.innerWidth)} destroyOnHidden
      footer={<div className="form-foot"><span style={{ flex: 1 }} /><Button onClick={onClose}>Cancel</Button>
        <Button type="primary" loading={busy} disabled={!changed || list.length === 0} onClick={() => void save()}>Save stages</Button></div>}>
      <p className="muted" style={{ marginTop: 0 }}>The order here is the order of the board and of the field app. A stage that still has prospects
        cannot be removed until they are moved.</p>
      {list.map((s, i) => {
        const count = board.stage_counts[s] ?? 0;
        const isNew = !saved.includes(s);
        return (
          <div key={s} className="stage-row" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--ant-color-border, #e3e8ef)', borderRadius: 8, marginBottom: 6 }}>
            <span style={{ flex: 1 }}>{s} {isNew && <Tag color="gold">new</Tag>} {s === board.won_stage && <Tag>converts</Tag>}</span>
            <span className="muted" style={{ fontSize: 12 }}>{isNew ? '' : `${count} prospect${count === 1 ? '' : 's'}`}</span>
            <Button size="small" type="text" icon={<ArrowUpOutlined />} aria-label={`Move ${s} up`} disabled={i === 0} onClick={() => setList(shift(list, i, -1))} />
            <Button size="small" type="text" icon={<ArrowDownOutlined />} aria-label={`Move ${s} down`} disabled={i === list.length - 1} onClick={() => setList(shift(list, i, 1))} />
            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${s}`} disabled={count > 0 && !isNew}
              title={count > 0 && !isNew ? 'Move its prospects first' : 'Remove'} onClick={() => setList(list.filter((x) => x !== s))} />
          </div>
        );
      })}
      <Space.Compact style={{ width: '100%', marginTop: 8 }}>
        <Input placeholder="New stage name" value={name} maxLength={40} status={problem ? 'error' : undefined}
          onChange={(e) => setName(e.target.value)} onPressEnter={add} />
        <Button icon={<PlusOutlined />} disabled={!name.trim() || !!problem} onClick={add}>Add stage</Button>
      </Space.Compact>
      {problem && <div style={{ color: 'var(--ant-color-error, #c0392b)', fontSize: 12, marginTop: 4 }}>{problem}</div>}
      {changed && <Alert type="info" showIcon style={{ marginTop: 12 }} title="Not saved yet: press Save stages." />}

      <h4 style={{ marginTop: 24 }}>Stage that converts</h4>
      <p className="muted" style={{ marginTop: 0 }}>Moving a prospect into this stage offers to turn it into a customer or doctor.</p>
      <Select style={{ minWidth: 220 }} value={board.won_stage} onChange={(stage) => void run({ action: 'won_stage', stage }).then(refresh)}
        options={[{ value: '', label: 'None' }, ...saved.map((s) => ({ value: s, label: s }))]} />

      <h4 style={{ marginTop: 24 }}>Activities per stage</h4>
      <p className="muted" style={{ marginTop: 0 }}>What a rep can log in each stage in the field app. Removing an activity stays on the web page.</p>
      <Select style={{ minWidth: 220, marginBottom: 8 }} value={actStage || undefined} onChange={setActStage} placeholder="Stage"
        options={saved.map((s) => ({ value: s, label: s }))} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {(board.activities[actStage] ?? []).map((a) => <Tag key={a}>{a}</Tag>)}
        {actStage && !(board.activities[actStage] ?? []).length && <span className="muted">No activities yet.</span>}
      </div>
      <Space.Compact style={{ width: '100%' }}>
        <Input placeholder="New activity" maxLength={60} value={activity} onChange={(e) => setActivity(e.target.value)} disabled={!actStage} />
        <Button disabled={!actStage || !activity.trim()} onClick={() => void run({ action: 'activity', stage: actStage, activity }).then((r) => { if (r) { setActivity(''); refresh(); } })}>Add</Button>
      </Space.Compact>
    </Drawer>
  );
}
