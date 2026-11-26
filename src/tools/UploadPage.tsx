import { useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Result, Skeleton, Space, Table, Tag, Upload } from 'antd';
import { ClearOutlined, CloudUploadOutlined, InboxOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ToolName, ToolResult } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { PageHeader, Panel } from '../ui/parts';
import { contactRows, expenseRows, invoiceRows, readTable } from './fileRows';

type Kind = Extract<ToolName, 'route_expense' | 'invoice_upload' | 'contact_upload'>;
interface Setup { columns: string[]; heads?: string[]; types?: string[]; reps?: { key: string; code: string; name: string; expenses: Record<string, unknown>[] }[] }
const TITLES: Record<Kind, string> = { route_expense: 'Route plan expense upload', invoice_upload: 'Sales invoice upload', contact_upload: 'Customer contacts upload' };
const ACCEPT: Record<Kind, string> = { route_expense: '.xlsx', invoice_upload: '.csv', contact_upload: '.xlsx,.csv' };
const NOTES: Record<Kind, string> = {
  route_expense: 'Each rep in the file gets the expense list from the file in place of the current one.',
  invoice_upload: 'Invoices are added. Nothing is saved if any line has a problem; invoice numbers already saved are refused.',
  contact_upload: 'Contacts and location tags are added to the customers; ones the customer already has are not added again.',
};
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/** Upload an Excel / CSV file as the web page does: read it here, check it on the server, then save once. */
export default function UploadPage({ kind, classicPath, openClassic }: { kind: Kind; classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const { message, modal } = AntApp.useApp();
  const q = useQuery({ queryKey: ['tool', kind], queryFn: () => api.fetchTool<Setup>(kind), staleTime: 0 });
  const [file, setFile] = useState('');
  const [body, setBody] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [check, setCheck] = useState<ToolResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(newId);

  const columns = useMemo(() => (preview[0] ? Object.keys(preview[0]).filter((k) => k !== 'key').map((k) => ({ title: k, dataIndex: k, key: k, ellipsis: true })) : []), [preview]);

  if (q.isPending) return <Skeleton active />;
  if (q.isError) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={<Button type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>} />;
  }
  const setup = q.data;

  const read = async (f: File) => {
    setProblem(null); setCheck(null); setBody(null); setPreview([]); setNotes([]); setFile(f.name); setRequestId(newId());
    try {
      const table = await readTable(f);
      let next: Record<string, unknown>; let rows: Record<string, unknown>[] = []; let skipped: string[] = [];
      if (kind === 'route_expense') {
        const out = expenseRows(table, setup.heads ?? [], setup.types ?? []);
        if (out.error) { setProblem(out.error); return; }
        next = { rows: out.rows }; skipped = out.skipped;
        rows = Object.entries(out.rows).flatMap(([code, lines]) => lines.map((l) => ({ CODE: code, ...l })));
      } else if (kind === 'invoice_upload') {
        const out = invoiceRows(table);
        if (out.error) { setProblem(out.error); return; }
        next = { rows: out.rows }; rows = out.rows;
      } else {
        const out = contactRows(table);
        if (out.error) { setProblem(out.error); return; }
        next = { data: out.data, tags: out.tags, headers: out.headers };
        rows = Object.entries(out.data).flatMap(([code, list]) => list.map((c) => ({ 'CUSTOMER CODE': code, ...c })));
      }
      if (!rows.length) { setProblem('Nothing in this file can be saved.'); setNotes(skipped); return; }
      setBody(next); setPreview(rows.map((r, i) => ({ key: i, ...r }))); setNotes(skipped);
      setBusy(true);
      const res = await api.saveTool(kind, { ...next, dry_run: true });
      setCheck(res);
    } catch (e) {
      const d = describeError(asAppError(e));
      setProblem(e instanceof Error && !('code' in e) ? e.message : `${d.title}. ${d.text}`);
    } finally { setBusy(false); }
  };

  const summary = () => {
    if (!check) return '';
    if (kind === 'route_expense') return `${check.replaced?.length ?? 0} reps get a new expense list.`;
    if (kind === 'invoice_upload') return `${check.rows ?? preview.length} invoices will be added.`;
    return `${check.contacts ?? 0} contacts will be added to ${check.customers ?? 0} customers${check.skipped ? ` (${check.skipped} already saved, left out)` : ''}.`;
  };

  const save = () => {
    if (!body || !check?.ok) return;
    modal.confirm({
      title: 'Save this file?', content: <><p>{summary()}</p><p>{NOTES[kind]}</p></>, okText: 'Save',
      onOk: async () => {
        setBusy(true); setProblem(null);
        try {
          const res = await api.saveTool(kind, { ...body, request_id: requestId });
          if (!res.ok) { setProblem(res.message || 'Not saved.'); setRequestId(newId()); return; }
          void message.success(res.message || 'Saved');
          setBody(null); setPreview([]); setCheck(null); setFile(''); setNotes([]);
          void q.refetch();
        } catch (e) {
          const d = describeError(asAppError(e));
          setProblem(`${d.title}. ${d.text}`);
          report(e);
        } finally { setBusy(false); }
      },
    });
  };

  const clearRep = (rep: { key: string; name: string; expenses: unknown[] }) => modal.confirm({
    title: `Clear the expenses of ${rep.name}?`, content: `${rep.expenses.length} expense line(s) are removed from this rep (kept in the change log).`,
    okText: 'Clear', okButtonProps: { danger: true },
    onOk: async () => {
      try {
        const res = await api.saveTool('route_expense', { action: 'clear', key: rep.key, request_id: newId() });
        if (res.ok) { void message.success(res.message || 'Cleared'); void q.refetch(); } else setProblem(res.message || 'Not cleared.');
      } catch (e) { report(e); }
    },
  });

  return (
    <>
      <PageHeader title={TITLES[kind]} meta={<span>Columns: {setup.columns.join(', ')}</span>}
        actions={<Button onClick={() => openClassic(classicPath)}>Open in classic window</Button>} />
      <Panel title="File">
        <p className="muted" style={{ marginTop: 0 }}>{NOTES[kind]}{kind === 'route_expense' && setup.heads ? ` Expense heads: ${setup.heads.join(', ')}.` : ''}</p>
        <Upload.Dragger accept={ACCEPT[kind]} showUploadList={false} beforeUpload={(f) => { void read(f); return false; }} disabled={busy}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p>{file || `Drop a ${ACCEPT[kind].replace(/,/g, ' or ')} file here, or click to choose one`}</p>
        </Upload.Dragger>
        {problem && <Alert type="error" showIcon style={{ marginTop: 12 }} title={problem} />}
        {notes.length > 0 && <Alert type="warning" showIcon style={{ marginTop: 12 }} title={`${notes.length} line(s) left out, as on the web page`}
          description={<ul style={{ margin: 0, paddingLeft: 18 }}>{notes.slice(0, 20).map((n) => <li key={n}>{n}</li>)}</ul>} />}
        {check && !check.ok && (check.problems?.length ?? 0) > 0 && <Alert type="error" showIcon style={{ marginTop: 12 }}
          title="Fix these in the file, then choose it again" description={<ul style={{ margin: 0, paddingLeft: 18 }}>{check.problems!.slice(0, 30).map((p) => <li key={p}>{p}</li>)}</ul>} />}
        {check?.ok && <Alert type="success" showIcon style={{ marginTop: 12 }} title={`Checked: ${summary()}`} />}
        {kind === 'route_expense' && check?.replaced && check.replaced.length > 0 && (
          <Space wrap style={{ marginTop: 8 }}>{check.replaced.map((r) => <Tag key={r.code}>{r.name} ({r.code}): {r.before} → {r.after} lines</Tag>)}</Space>
        )}
        <div style={{ marginTop: 12 }}>
          <Button type="primary" icon={<CloudUploadOutlined />} disabled={!check?.ok} loading={busy} onClick={save}>Save</Button>
        </div>
      </Panel>
      {preview.length > 0 && (
        <Panel title={`Rows in the file (${preview.length})`} flush>
          <Table size="small" columns={columns} dataSource={preview.slice(0, 500)} pagination={{ pageSize: 50, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
        </Panel>
      )}
      {kind === 'route_expense' && (
        <Panel title="Current expenses" sub={`${setup.reps?.length ?? 0} reps`} flush>
          <Table size="small" rowKey="key" pagination={{ pageSize: 50, hideOnSinglePage: true }} dataSource={setup.reps ?? []}
            columns={[
              { title: 'Code', dataIndex: 'code', key: 'code' }, { title: 'Name', dataIndex: 'name', key: 'name' },
              { title: 'Expenses', key: 'e', render: (_: unknown, r: NonNullable<Setup['reps']>[number]) => r.expenses.map((x, i) =>
                <Tag key={i}>{String(x.EXPENSE_TYPE ?? '')} {String(x.EXPENSE_HEAD ?? '')} {String(x.EXPENSE_AMOUNT ?? '')}</Tag>) },
              { title: '', key: 'c', width: 90, render: (_: unknown, r: NonNullable<Setup['reps']>[number]) =>
                <Button size="small" danger icon={<ClearOutlined />} onClick={() => clearRep(r)}>Clear</Button> },
            ]} />
        </Panel>
      )}
    </>
  );
}
