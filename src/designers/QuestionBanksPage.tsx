import MoreMenu from '../ui/MoreMenu';
import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Checkbox, Drawer, Empty, Input, InputNumber, Radio, Result, Select, Space, Switch, Table, Tag, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BankQuestion } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import { PageHeader } from '../ui/parts';
import { bankProblem } from './bank';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
type Q = BankQuestion & { _id: string };

/** Question banks (web: Utility / Question Bank): the daily quiz questions the field app asks. */
export default function QuestionBanksPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const [opened, setOpened] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['designer', 'question_banks'], queryFn: () => api.fetchDesigner('question_banks') });
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  if (q.isPending) return <StillLoading />;
  if (q.isError) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  return (
    <>
      <PageHeader title="Question bank" meta={<span>{q.data.banks.length} banks</span>}
        actions={<>
          <Button icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
          <MoreMenu items={[{ key: 'classic', label: 'Upload questions in classic window', onClick: () => openClassic(classicPath) }]} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpened('')}>Create</Button>
        </>} />
      <div className="panel flush">
        <Table size="small" rowKey="key" dataSource={q.data.banks} pagination={false} locale={{ emptyText: 'No question banks yet' }}
          onRow={(r) => ({ onClick: () => setOpened(r.key), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Title', dataIndex: 'title', key: 'title' },
            { title: 'Questions', dataIndex: 'questions', key: 'n', align: 'right' as const },
            { title: 'Per day', dataIndex: 'perday', key: 'perday', align: 'right' as const },
            { title: 'Active', key: 'status', render: (_: unknown, r) => (r.status ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>) },
          ]} />
      </div>
      {opened !== null && <BankEditor bankKey={opened} categories={q.data.categories} onClose={() => setOpened(null)} openClassic={() => openClassic(classicPath)} />}
    </>
  );
}

function BankEditor({ bankKey, categories, onClose, openClassic }: { bankKey: string; categories: string[]; onClose: () => void; openClassic: () => void }) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['designer', 'question_banks', bankKey], queryFn: () => api.fetchDesigner('question_banks', bankKey),
    enabled: !!bankKey, gcTime: 0, staleTime: 0 });
  const [title, setTitle] = useState('');
  const [perday, setPerday] = useState(3);
  const [status, setStatus] = useState(true);
  const [cats, setCats] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newId);
  useEffect(() => {
    if (!bankKey) { setQuestions([{ _id: newId(), q: '', t: 'radio', op: [{ t: '', a: 'Yes' }, { t: '', a: 'No' }] }]); return; }
    const b = q.data?.bank;
    if (b) {
      setTitle(b.title); setPerday(b.perday); setStatus(b.status); setCats(b.category_list);
      setQuestions(b.questions.map((x) => ({ ...x, _id: newId() })));
    }
  }, [bankKey, q.data]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const editable = !bankKey || !!q.data?.editable;

  const setQ = (id: string, patch: Partial<BankQuestion>) => setQuestions((qs) => qs.map((x) => (x._id === id ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) => setQuestions((qs) => { const n = [...qs]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); return n; });

  const save = async () => {
    const plain = questions.map(({ _id, ...rest }) => rest as BankQuestion);
    const p = bankProblem(title, perday, plain);
    if (p) { setProblem(p); return; }
    setSaving(true); setProblem(null);
    try {
      const res = await api.saveDesigner('question_banks', { key: bankKey, base: q.data?.bank?.base, title, perday, status, category_list: cats, questions: plain, request_id: requestId });
      if (!res.ok) { setProblem(res.message || 'Not saved.'); setRequestId(newId()); return; }
      void message.success(res.message || 'Saved');
      void qc.invalidateQueries({ queryKey: ['designer', 'question_banks'] });
      onClose();
    } catch (e) {
      const d = describeError(asAppError(e));
      setProblem(`${d.title}. ${d.text}`);
      report(e);
    } finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} size={Math.min(900, window.innerWidth)} destroyOnHidden title={bankKey ? `Question bank: ${title || '…'}` : 'New question bank'}
      footer={editable && (
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>Save</Button>
        </Space>
      )}>
      {bankKey && q.isPending && <StillLoading />}
      {!editable && q.data && <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={q.data.reason}
        action={<Button size="small" onClick={openClassic}>Open classic window</Button>} />}
      {(!bankKey || q.data) && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            <label style={{ gridColumn: 'span 2' }}>Title<Input value={title} disabled={!editable} onChange={(e) => setTitle(e.target.value)} /></label>
            <label>Questions per day<InputNumber min={1} precision={0} value={perday} disabled={!editable} style={{ width: '100%' }} onChange={(v) => setPerday(Number(v) || 0)} /></label>
            <label>Active<div><Switch checked={status} disabled={!editable} onChange={setStatus} /></div></label>
            <label style={{ gridColumn: '1 / -1' }}>Categories<Select mode="multiple" allowClear value={cats} disabled={!editable} style={{ width: '100%' }}
              options={categories.map((c) => ({ value: c, label: c }))} onChange={setCats} /></label>
          </div>
          {problem && <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problem} />}
          {questions.length === 0 && <Empty description="No questions yet" />}
          {questions.map((x, i) => (
            <section key={x._id} className="panel" style={{ padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <strong>{i + 1}.</strong>
                <Input value={x.q} disabled={!editable} placeholder="Question" onChange={(e) => setQ(x._id, { q: e.target.value })} />
                <Radio.Group value={x.t} disabled={!editable} style={{ flex: 'none', whiteSpace: 'nowrap' }} onChange={(e) => setQ(x._id, { t: e.target.value })} optionType="button"
                  options={[{ value: 'radio', label: 'Radio' }, { value: 'checkbox', label: 'Checkbox' }]} />
                {editable && <>
                  <Tooltip title="Move up"><Button size="small" disabled={i === 0} icon={<ArrowUpOutlined />} onClick={() => move(i, -1)} /></Tooltip>
                  <Tooltip title="Move down"><Button size="small" disabled={i === questions.length - 1} icon={<ArrowDownOutlined />} onClick={() => move(i, 1)} /></Tooltip>
                  <Tooltip title="Remove question"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => setQuestions((qs) => qs.filter((y) => y._id !== x._id))} /></Tooltip>
                </>}
              </div>
              {x.op.map((o, j) => (
                <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 4px 24px' }}>
                  <Input value={String(o.t)} disabled={!editable} placeholder="Answer" onChange={(e) => setQ(x._id, { op: x.op.map((p, k) => (k === j ? { ...p, t: e.target.value } : p)) })} />
                  <Checkbox checked={o.a === 'Yes'} disabled={!editable} onChange={(e) => setQ(x._id, { op: x.op.map((p, k) => (k === j ? { ...p, a: e.target.checked ? 'Yes' : 'No' } : p)) })}>Correct</Checkbox>
                  {editable && <Button size="small" danger icon={<DeleteOutlined />} aria-label="Remove answer" onClick={() => setQ(x._id, { op: x.op.filter((_, k) => k !== j) })} />}
                </div>
              ))}
              {editable && <Button size="small" type="link" icon={<PlusOutlined />} style={{ marginLeft: 16 }} onClick={() => setQ(x._id, { op: [...x.op, { t: '', a: 'No' }] })}>Add answer</Button>}
            </section>
          ))}
          {editable && <Button icon={<PlusOutlined />} onClick={() => setQuestions((qs) => [...qs, { _id: newId(), q: '', t: 'radio', op: [{ t: '', a: 'Yes' }, { t: '', a: 'No' }] }])}>Add question</Button>}
        </>
      )}
    </Drawer>
  );
}
