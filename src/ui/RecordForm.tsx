import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, App as AntApp, Button, Drawer, Form, Input, InputNumber, Popconfirm, Result, Select, Skeleton, Space, Switch, Tag } from 'antd';
import { ReloadOutlined, StopOutlined, CheckCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Choice, FormField, FormPayload, FormValue, SubmitBody, SubmitResult } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { useCan } from '../access';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

function choicesFor(f: FormField, current: FormValue): Choice[] {
  const list = [...(f.options ?? f.choices ?? [])];
  const values = Array.isArray(current) ? current : current === null || current === undefined || current === '' ? [] : [String(current)];
  for (const v of values) if (!list.some((c) => c.value === v)) list.push({ value: v, label: v });
  return list;
}

/** One input. Form.Item passes value / checked / onChange in `rest`; they must reach the real control. */
function Input_({ f, saved, editing, ...rest }: { f: FormField; saved: FormValue; editing: boolean; [k: string]: unknown }) {
  const locked = !!(f.readonly || (f.create_only && editing));
  const p = { ...rest, disabled: locked } as Record<string, unknown>;
  switch (f.kind) {
    case 'textarea': return <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} {...p} />;
    case 'number': return <InputNumber style={{ width: '100%' }} {...p} />;
    case 'int': return <InputNumber style={{ width: '100%' }} precision={0} {...p} />;
    case 'switch': return <Switch {...p} />;
    case 'select': return <Select showSearch allowClear optionFilterProp="label" options={choicesFor(f, saved)} {...p} />;
    case 'multi': case 'flags': return <Select mode="multiple" allowClear optionFilterProp="label" options={choicesFor(f, saved)} {...p} />;
    case 'taglist': return <Select mode="tags" allowClear open={false} suffixIcon={null} {...p} />;
    case 'tags': return <Select mode="tags" allowClear tokenSeparators={[',']} options={choicesFor(f, saved)} {...p} />;
    case 'date': return <Input type="date" {...p} />;
    case 'time': return <Input type="time" {...p} />;
    default: return f.secret ? <Input.Password autoComplete="new-password" {...p} /> : <Input {...p} />;
  }
}

/** Only what the person changed is sent when editing; the server keeps every other saved value. */
export function changedValues(saved: Record<string, FormValue>, current: Record<string, FormValue>): Record<string, FormValue> {
  const out: Record<string, FormValue> = {};
  for (const [k, v] of Object.entries(current)) {
    const norm = (x: unknown) => (x === undefined || x === null ? '' : Array.isArray(x) ? JSON.stringify(x) : String(x));
    if (norm(v) !== norm(saved[k])) out[k] = v === undefined ? null : v;
  }
  return out;
}

/** Add or edit one record. Saving runs the web page's own save, so the same checks apply. Nothing is ever deleted. */
export default function RecordForm({ name, recordKey, open, onClose, onSaved, inline, mode, presets, submit, top, saveLabel, title, allowCreate }: {
  /** values filled in when adding a new record (e.g. Samples: "Sample product" on) */
  presets?: Record<string, unknown>;
  /** creates the record another way (the pipeline: new prospect, convert); the form still checks the fields first */
  submit?: (values: Record<string, FormValue>, requestId: string) => Promise<SubmitResult>;
  /** extra controls above the fields */
  top?: ReactNode;
  saveLabel?: string;
  title?: string;
  /** the caller already checked the right to create (pages whose own rights are not the form page's) */
  allowCreate?: boolean;
  name: string; recordKey: string | null; open: boolean; onClose: () => void; onSaved?: (key: string) => void;
  /** show as a page section instead of a side drawer; settings forms save with "update", entry forms with "create" */
  inline?: boolean; mode?: 'settings' | 'entry';
}) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const requestId = useMemo(() => newId(), [open, recordKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const editing = !!recordKey || mode === 'settings';

  const q = useQuery({ queryKey: ['form', name, recordKey ?? ''], queryFn: () => api.fetchForm(name, recordKey ?? undefined), enabled: open, staleTime: 0, gcTime: 0 });
  useEffect(() => {
    if (q.data) { form.resetFields(); form.setFieldsValue(recordKey ? q.data.values : { ...q.data.values, ...presets }); setProblem(null); }
    // presets are fixed per list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, form, recordKey]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  const sections = useMemo(() => {
    const out: [string, FormField[]][] = [];
    for (const f of q.data?.fields ?? []) {
      const s = f.section ?? 'Details';
      const hit = out.find(([n]) => n === s);
      if (hit) hit[1].push(f); else out.push([s, [f]]);
    }
    return out;
  }, [q.data]);

  const send = async (p: FormPayload, action: SubmitBody['action']) => {
    setBusy(action); setProblem(null);
    try {
      const all = action === 'create' || action === 'update' ? await form.validateFields() : undefined;
      const values = all && action === 'update' ? changedValues(p.values, all) : all;
      const rid = `${requestId}-${action}-${Date.now()}`;
      const res = submit && action === 'create'
        ? await submit(values as Record<string, FormValue>, rid)
        : await api.submitForm(name, { action, key: recordKey ?? undefined, values, request_id: rid });
      if (!res.ok) { setProblem(res.message || 'The change was not saved.'); return; }
      if (res.notice) void message.warning(res.message); else void message.success(res.message || 'Saved');
      void qc.invalidateQueries({ queryKey: ['master'] });
      void qc.invalidateQueries({ queryKey: ['form', name] });
      onSaved?.(res.key || recordKey || '');
      if (inline) { if (mode === 'entry') form.resetFields(); else void q.refetch(); } else onClose();
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return; // the form shows what is missing
      const d = describeError(asAppError(e));
      setProblem(`${d.title}. ${d.text}`);
      report(e);
    } finally { setBusy(null); }
  };

  const p = q.data;
  const canCreate = useCan('create') || !!allowCreate;
  const canEdit = useCan('edit');
  const canDelete = useCan('delete');
  const mayDeactivate = canDelete;
  const maySave = editing ? canEdit : canCreate;
  const active = p?.status_field ? p.values[p.status_field] !== false : true;
  const footer = p && (
    <div className="form-foot">
      {editing && !inline && p.can_deactivate && mayDeactivate && (active ? (
        <Popconfirm title="Deactivate this record?" description="It is switched off, not deleted. You can activate it again at any time."
          okText="Deactivate" onConfirm={() => void send(p, 'deactivate')}>
          <Button icon={<StopOutlined />} loading={busy === 'deactivate'}>Deactivate</Button>
        </Popconfirm>
      ) : (
        <Button icon={<CheckCircleOutlined />} loading={busy === 'activate'} onClick={() => void send(p, 'activate')}>Activate</Button>
      ))}
      <span style={{ flex: 1 }} />
      {!inline && <Button onClick={onClose}>Cancel</Button>}
      {maySave ? <Button type="primary" icon={<SaveOutlined />} loading={busy === 'create' || busy === 'update'}
        onClick={() => void send(p, editing ? 'update' : 'create')}>{saveLabel ?? (mode === 'entry' ? 'Save entry' : editing ? 'Save changes' : 'Create')}</Button>
        : <span className="muted">View only for your role</span>}
    </div>
  );
  const body = (
    <>
      {q.isPending && <Skeleton active paragraph={{ rows: 10 }} />}
      {q.isError && (
        <Result status="warning" title={describeError(asAppError(q.error)).title} subTitle={describeError(asAppError(q.error)).text}
          extra={<Button icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>} />
      )}
      {problem && <Alert type="error" showIcon title="Not saved" description={problem} style={{ marginBottom: 16 }} />}
      {top}
      {p && (
        <Form form={form} layout="vertical" requiredMark initialValues={p.values}>
          {sections.map(([section, fields]) => (
            <div className="form-section" key={section}>
              {sections.length > 1 && <h4>{section}</h4>}
              <div className="form-grid">
                {fields.map((f) => (
                  <Form.Item key={f.name} name={f.name} label={f.label} extra={f.help}
                    valuePropName={f.kind === 'switch' ? 'checked' : 'value'}
                    className={f.kind === 'textarea' || f.kind === 'tags' || f.kind === 'taglist' || f.kind === 'flags' || f.secret ? 'span-2' : undefined}
                    rules={(f.required && !(f.create_only && editing)) || (f.create_required && !editing) ? [{ required: true, message: `Enter ${f.label.toLowerCase()}` }] : undefined}>
                    <Input_ f={f} saved={p.values[f.name]} editing={editing} />
                  </Form.Item>
                ))}
              </div>
            </div>
          ))}
        </Form>
      )}
    </>
  );
  if (inline) return <div className="panel">{body}{footer && <div style={{ marginTop: 8 }}>{footer}</div>}</div>;
  return (
    <Drawer open={open} onClose={onClose} size={Math.min(720, window.innerWidth)} destroyOnHidden
      title={p ? <Space>{title ?? (editing ? `Edit ${p.title.toLowerCase()}` : `New ${p.title.toLowerCase()}`)}
        {editing && p.can_deactivate && <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>}</Space> : 'Loading...'}
      footer={footer}>
      {body}
    </Drawer>
  );
}
