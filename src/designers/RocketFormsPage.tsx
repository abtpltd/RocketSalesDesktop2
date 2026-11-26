import MoreMenu from '../ui/MoreMenu';
import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Checkbox, Input, Result, Select, Space, Table } from 'antd';
import { PlusOutlined, ReloadOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RocketFormRow } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import { PageHeader } from '../ui/parts';
import { changedRows, type EditRow } from './rocketRows';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/** Rocket form masters (web: Master / Rocket Form): short name, title, print design and "send by mail" per form. */
export default function RocketFormsPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['designer', 'rocket_forms'], queryFn: () => api.fetchDesigner('rocket_forms'), staleTime: 0 });
  const [rows, setRows] = useState<EditRow[]>([]);
  const [draft, setDraft] = useState({ shortname: '', title: '', design: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // kept for a retry after a timeout (the server then answers from the first try instead of adding rows twice)
  const [requestId, setRequestId] = useState(newId);
  useEffect(() => { if (q.data) setRows(q.data.rows.map((r) => ({ ...r, id: r.k || newId() }))); }, [q.data]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  if (q.isPending) return <StillLoading />;
  if (q.isError) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  const saved: RocketFormRow[] = q.data.rows;
  const changes = changedRows(saved, rows);
  const set = (id: string, patch: Partial<EditRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = () => {
    if (!draft.shortname.trim() || !draft.title.trim() || !draft.design) { setProblem('Please fill in all fields: Short Name, Title, and Design!'); return; }
    setRows((rs) => [...rs, { id: newId(), k: '', shortname: draft.shortname.trim(), title: draft.title.trim(), design: draft.design, sendByMail: false }]);
    setDraft({ shortname: '', title: '', design: '' }); setProblem(null);
  };
  const save = async () => {
    if (!changes.length) return;
    if (changes.some((r) => !r.st.trim() || !r.t.trim())) { setProblem('Short name and title cannot be empty.'); return; }
    setSaving(true); setProblem(null);
    try {
      const res = await api.saveDesigner('rocket_forms', { rows: changes, request_id: requestId });
      setRequestId(newId());
      if (!res.ok) { setProblem(res.message || 'Not saved.'); return; }
      void message.success(res.message || 'Saved');
      void qc.invalidateQueries({ queryKey: ['designer', 'rocket_forms'] });
    } catch (e) {
      const d = describeError(asAppError(e));
      setProblem(`${d.title}. ${d.text}`);
      report(e);
    } finally { setSaving(false); }
  };
  return (
    <>
      <PageHeader title="Rocket form masters" meta={<span>{saved.length} forms</span>}
        actions={<>
          <Button icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
          <MoreMenu items={[{ key: 'classic', label: 'Remove in classic window', onClick: () => openClassic(classicPath) }]} />
        </>} />
      <p className="muted" style={{ marginTop: -6 }}>Removing a form master deletes it for good on the web, so it stays in the classic window.</p>
      {q.data.designs.length > 0 ? (
        <div className="filters">
          <Input placeholder="Short name" style={{ maxWidth: 180 }} value={draft.shortname} onChange={(e) => setDraft({ ...draft, shortname: e.target.value })} onPressEnter={add} />
          <Input placeholder="Title" style={{ maxWidth: 260 }} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onPressEnter={add} />
          <Select placeholder="Select design" style={{ minWidth: 200 }} value={draft.design || undefined}
            options={q.data.designs.map((d) => ({ value: d, label: d }))} onChange={(d) => setDraft({ ...draft, design: d })} />
          <Button icon={<PlusOutlined />} onClick={add}>Add</Button>
        </div>
      ) : <Alert type="info" showIcon style={{ marginBottom: 12 }} title="No print designs are set up for this company, so new form masters cannot be added." />}
      {problem && <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problem} />}
      <div className="panel flush">
        <Table size="small" rowKey="id" dataSource={rows} pagination={false} locale={{ emptyText: 'No form masters' }}
          columns={[
            { title: 'Short name', key: 'st', render: (_: unknown, r: EditRow) => <Input value={r.shortname} onChange={(e) => set(r.id, { shortname: e.target.value })} /> },
            { title: 'Title', key: 't', render: (_: unknown, r: EditRow) => <Input value={r.title} onChange={(e) => set(r.id, { title: e.target.value })} /> },
            { title: 'Design', dataIndex: 'design', key: 'd' },
            { title: 'Send by mail', key: 'is', align: 'center' as const, render: (_: unknown, r: EditRow) => <Checkbox checked={r.sendByMail} onChange={(e) => set(r.id, { sendByMail: e.target.checked })} /> },
            { title: '', key: 'x', width: 60, render: (_: unknown, r: EditRow) => (!r.k ? <Button type="link" danger onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>Drop</Button> : null) },
          ]} />
      </div>
      <Space style={{ marginTop: 12 }}>
        {changes.length > 0 && <span className="muted">{changes.length} row(s) to save</span>}
        <Button icon={<UndoOutlined />} disabled={!changes.length || saving} onClick={() => setRows(saved.map((r) => ({ ...r, id: r.k })))}>Discard</Button>
        <Button type="primary" icon={<SaveOutlined />} disabled={!changes.length} loading={saving} onClick={() => void save()}>Save</Button>
      </Space>
    </>
  );
}
