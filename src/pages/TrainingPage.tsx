import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Input, Result, Space } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, UndoOutlined, YoutubeOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TrainingItem, TrainingPayload } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import { moveItem } from './trainingMath';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/** App Training: the videos (YouTube links) and paragraphs the field app shows, in this order. */
export default function TrainingPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['setup', 'app_training'], queryFn: () => api.fetchSetup<TrainingPayload>('app_training'), staleTime: 0 });
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState(''); const [yt, setYt] = useState('');
  const [title2, setTitle2] = useState(''); const [para, setPara] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newId);
  useEffect(() => { if (q.data) { setItems(q.data.items.map((i) => ({ ...i }))); setDirty(false); } }, [q.data]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  if (q.isPending) return <StillLoading />;
  if (q.isError || !q.data) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  const change = (next: TrainingItem[]) => { setItems(next); setDirty(true); };
  const add = (t: string, body: string, kind: 'video' | 'para') => {
    if (!t.trim()) { setProblem('Enter Title'); return false; }
    if (!body.trim()) { setProblem(kind === 'video' ? 'Enter Youtube URL' : 'Enter paragraph'); return false; }
    setProblem(null); change([...items, { t: t.trim(), yt: body.trim() }]); return true;
  };
  const save = async () => {
    setSaving(true); setProblem(null);
    try {
      const res = await api.saveSetup('app_training', { request_id: requestId, base: q.data!.base, items });
      if (!res.ok) { setProblem(res.message || 'Not saved.'); setRequestId(newId()); return; }
      void message.success(res.message || 'Updated'); setRequestId(newId());
      void qc.invalidateQueries({ queryKey: ['setup', 'app_training'] });
    } catch (e) {
      const d = describeError(asAppError(e)); setProblem(`${d.title}. ${d.text}`); setRequestId(newId()); report(e);
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="page-title">
        <h2>{q.data.title}</h2>
        <span className="muted">{items.length} items</span>
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <Button size="small" icon={<UndoOutlined />} disabled={!dirty} onClick={() => { setItems(q.data!.items.map((i) => ({ ...i }))); setDirty(false); }}>Discard</Button>
        <Button size="small" type="primary" icon={<SaveOutlined />} disabled={!dirty} loading={saving} onClick={() => void save()}>Save</Button>
      </div>
      {problem && <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problem} />}
      <div className="charts">
        <section className="panel">
          <div className="panel-head"><h3>Training in the app</h3><span className="sub">In this order</span></div>
          {items.length === 0 && <p className="muted">Nothing yet.</p>}
          {items.map((it, i) => (
            <div key={`${i}-${it.t}`} className="stat" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input value={it.t} onChange={(e) => change(items.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))} aria-label="Title" />
                  <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} style={{ marginTop: 6 }} value={it.yt} aria-label="YouTube link or paragraph"
                    onChange={(e) => change(items.map((x, j) => (j === i ? { ...x, yt: e.target.value } : x)))} />
                </div>
                <Space direction="vertical" size={2}>
                  <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} aria-label="Move up" onClick={() => change(moveItem(items, i, -1))} />
                  <Button size="small" icon={<ArrowDownOutlined />} disabled={i === items.length - 1} aria-label="Move down" onClick={() => change(moveItem(items, i, 1))} />
                  <Button size="small" danger icon={<DeleteOutlined />} aria-label="Remove" onClick={() => change(items.filter((_, j) => j !== i))} />
                </Space>
              </div>
            </div>
          ))}
        </section>
        <section className="panel">
          <div className="panel-head"><h3><YoutubeOutlined /> Add a video</h3></div>
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ marginBottom: 8 }} />
          <Input placeholder="YouTube video URL" value={yt} onChange={(e) => setYt(e.target.value)} style={{ marginBottom: 8 }} />
          <Button icon={<PlusOutlined />} onClick={() => { if (add(title, yt, 'video')) { setTitle(''); setYt(''); } }}>Add</Button>
          <div className="panel-head" style={{ marginTop: 20 }}><h3>Add a paragraph</h3></div>
          <Input placeholder="Title" value={title2} onChange={(e) => setTitle2(e.target.value)} style={{ marginBottom: 8 }} />
          <Input.TextArea rows={6} placeholder="Paragraph" value={para} onChange={(e) => setPara(e.target.value)} style={{ marginBottom: 8 }} />
          <Button icon={<PlusOutlined />} onClick={() => { if (add(title2, para, 'para')) { setTitle2(''); setPara(''); } }}>Add</Button>
          <p className="muted" style={{ marginTop: 12 }}>Changes reach the app after you press Save.</p>
        </section>
      </div>
    </>
  );
}
