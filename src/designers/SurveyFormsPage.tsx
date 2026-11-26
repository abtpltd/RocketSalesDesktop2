import MoreMenu from '../ui/MoreMenu';
import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Checkbox, Drawer, Empty, Input, Result, Select, Space, Switch, Table, Tabs, Tag, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FieldItems, SurveyFormMeta } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import { PageHeader } from '../ui/parts';
import { applyView, newFieldItems, problemsOf, settingsFor, viewOf, type FieldView } from './surveyFields';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
type Row = { id: string; items: FieldItems };
const blankMeta: SurveyFormMeta = { key: '', title: '', shortName: '', description: '', clientGroup: [], active: true,
  forServiceCall: false, forAppMenu: false, forProspect: false, forSalesCall: false };

/** Survey forms (web: Utility / Survey Form). The list, and an editor for one form's fields. */
export default function SurveyFormsPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const [opened, setOpened] = useState<string | null>(null);  // '' = new form
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['designer', 'survey_forms'], queryFn: () => api.fetchDesigner('survey_forms') });
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  if (q.isPending) return <StillLoading />;
  if (q.isError) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  const s = search.trim().toLowerCase();
  const forms = q.data.forms.filter((f) => !s || `${f.title} ${f.shortName} ${f.description}`.toLowerCase().includes(s));
  return (
    <>
      <PageHeader title="Survey forms" meta={<span>{q.data.forms.length} forms</span>}
        actions={<>
          <Button icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
          <MoreMenu items={[{ key: 'classic', label: 'Open in classic window', onClick: () => openClassic(classicPath) }]} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpened('')}>New form</Button>
        </>} />
      <div className="filters"><Input.Search allowClear placeholder="Search forms" style={{ maxWidth: 320 }} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="panel flush">
        <Table size="small" rowKey="key" dataSource={forms} pagination={{ pageSize: 50, hideOnSinglePage: true }}
          onRow={(r) => ({ onClick: () => setOpened(r.key), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Title', dataIndex: 'title', key: 'title', sorter: (a, b) => a.title.localeCompare(b.title) },
            { title: 'Short name', dataIndex: 'shortName', key: 'shortName' },
            { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
            { title: 'Customer groups', key: 'g', render: (_: unknown, r: SurveyFormMeta) => r.clientGroup.join(', ') },
            { title: 'Shown as', key: 'as', render: (_: unknown, r: SurveyFormMeta) => (
              <Space size={4} wrap>
                {r.forServiceCall && <Tag>Service call</Tag>}{r.forAppMenu && <Tag>Menu</Tag>}
                {r.forProspect && <Tag>Prospect</Tag>}{r.forSalesCall && <Tag>Sales call</Tag>}
              </Space>) },
            { title: 'Status', key: 'st', render: (_: unknown, r: SurveyFormMeta) => (r.active ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>) },
          ]} />
      </div>
      {opened !== null && <SurveyEditor formKey={opened} groups={q.data.client_groups} types={q.data.types} hidden={q.data.hidden_types}
        onClose={() => setOpened(null)} openClassic={() => openClassic(classicPath)} />}
    </>
  );
}

function SurveyEditor({ formKey, groups, types, hidden, onClose, openClassic }: {
  formKey: string; groups: string[]; types: [string, string][]; hidden: string[]; onClose: () => void; openClassic: () => void;
}) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['designer', 'survey_forms', formKey], queryFn: () => api.fetchDesigner('survey_forms', formKey),
    enabled: !!formKey, gcTime: 0, staleTime: 0 });
  const [meta, setMeta] = useState<SurveyFormMeta>(blankMeta);
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState('edit');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newId);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!formKey) { setMeta(blankMeta); setRows([{ id: newId(), items: newFieldItems() }]); return; }
    if (q.data?.form) {
      const { fields, ...m } = q.data.form;
      setMeta(m); setRows(fields.map((items) => ({ id: newId(), items })));
    }
  }, [formKey, q.data]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  const editable = !formKey || !!q.data?.editable;
  const setM = (patch: Partial<SurveyFormMeta>) => { setMeta((m) => ({ ...m, ...patch })); setDirty(true); };
  const setField = (id: string, view: FieldView) => { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, items: applyView(r.items, view) } : r))); setDirty(true); };
  const move = (i: number, by: number) => {
    setRows((rs) => { const n = [...rs]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); return n; });
    setDirty(true);
  };

  const save = async () => {
    const p = problemsOf(meta.title, meta.description, rows.map((r) => r.items));
    if (p) { setProblem(p); return; }
    setSaving(true); setProblem(null);
    try {
      const res = await api.saveDesigner('survey_forms', { ...meta, key: formKey, fields: rows.map((r) => r.items), request_id: requestId });
      if (!res.ok) { setProblem(res.message || 'Not saved.'); setRequestId(newId()); return; }
      void message.success(res.message || 'Saved');
      void qc.invalidateQueries({ queryKey: ['designer', 'survey_forms'] });
      onClose();
    } catch (e) {
      const d = describeError(asAppError(e));
      setProblem(`${d.title}. ${d.text}`);
      report(e);
    } finally { setSaving(false); }
  };

  const typeOptions = (current: string) => [
    ...types.map(([v, l]) => ({ value: v, label: l })),
    ...(hidden.includes(current) ? [{ value: current, label: `${current} (hidden on the web)` }] : []),
  ];

  return (
    <Drawer open onClose={onClose} size={Math.min(1100, window.innerWidth)} destroyOnHidden
      title={formKey ? `Survey form: ${meta.title || '…'}` : 'New survey form'}
      footer={editable && (
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!!formKey && !dirty} onClick={() => void save()}>Save</Button>
        </Space>
      )}>
      {formKey && q.isPending && <StillLoading />}
      {q.isError && <Result status="warning" title={describeError(asAppError(q.error)).title} subTitle={describeError(asAppError(q.error)).text} />}
      {(!formKey || q.data) && (
        <>
          {!editable && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={q.data?.reason || 'This form cannot be changed here.'}
              action={<Button size="small" onClick={openClassic}>Open classic window</Button>} />
          )}
          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 12 }}>
            <label>Form title<Input value={meta.title} disabled={!editable} onChange={(e) => setM({ title: e.target.value })} /></label>
            <label>Short name<Input value={meta.shortName} disabled={!editable} onChange={(e) => setM({ shortName: e.target.value })} /></label>
            <label style={{ gridColumn: '1 / -1' }}>Form description<Input value={meta.description} disabled={!editable} onChange={(e) => setM({ description: e.target.value })} /></label>
            <label>Customer groups<Select mode="multiple" allowClear value={meta.clientGroup} disabled={!editable} style={{ width: '100%' }}
              options={groups.map((g) => ({ value: g, label: g }))} onChange={(v) => setM({ clientGroup: v })} /></label>
            <label>Status<div><Switch checked={meta.active} disabled={!editable} onChange={(v) => setM({ active: v })} checkedChildren="Active" unCheckedChildren="Inactive" /></div></label>
          </div>
          <Space wrap style={{ marginBottom: 12 }}>
            <Checkbox checked={meta.forServiceCall} disabled={!editable} onChange={(e) => setM({ forServiceCall: e.target.checked })}>Show as activity in service calls</Checkbox>
            <Checkbox checked={meta.forAppMenu} disabled={!editable} onChange={(e) => setM({ forAppMenu: e.target.checked })}>Show as menu</Checkbox>
            <Checkbox checked={meta.forProspect} disabled={!editable} onChange={(e) => setM({ forProspect: e.target.checked })}>Show as prospect</Checkbox>
            <Checkbox checked={meta.forSalesCall} disabled={!editable} onChange={(e) => setM({ forSalesCall: e.target.checked })}>Show as sales call</Checkbox>
          </Space>
          {problem && <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problem} />}
          <Tabs activeKey={tab} onChange={setTab} items={[
            { key: 'edit', label: `Fields (${rows.length})`, children: (
              <>
                {rows.length === 0 && <Empty description="No fields yet" />}
                {rows.map((r, i) => (
                  <FieldBox key={r.id} index={i} items={r.items} editable={editable} typeOptions={typeOptions}
                    onChange={(v) => setField(r.id, v)} onUp={i > 0 ? () => move(i, -1) : undefined}
                    onDown={i < rows.length - 1 ? () => move(i, 1) : undefined}
                    onRemove={() => { setRows((rs) => rs.filter((x) => x.id !== r.id)); setDirty(true); }} />
                ))}
                {editable && <Button icon={<PlusOutlined />} onClick={() => { setRows((rs) => [...rs, { id: newId(), items: newFieldItems() }]); setDirty(true); }}>New field</Button>}
              </>) },
            { key: 'preview', label: <span><EyeOutlined /> Preview</span>, children: <Preview title={meta.title} rows={rows} /> },
          ]} />
        </>
      )}
    </Drawer>
  );
}

function FieldBox({ index, items, editable, typeOptions, onChange, onUp, onDown, onRemove }: {
  index: number; items: FieldItems; editable: boolean; typeOptions: (t: string) => { value: string; label: string }[];
  onChange: (v: FieldView) => void; onUp?: () => void; onDown?: () => void; onRemove: () => void;
}) {
  const v = useMemo(() => viewOf(items), [items]);
  const s = settingsFor(v.type);
  const set = (patch: Partial<FieldView>) => onChange({ ...v, ...patch });
  const list = (key: 'options' | 'defaultoptions', label: string) => (
    <div style={{ gridColumn: '1 / -1' }}>
      <div className="muted" style={{ marginBottom: 4 }}>{label}</div>
      {v[key].map((o, i) => (
        <Space.Compact key={i} style={{ display: 'flex', marginBottom: 4 }}>
          <Input value={o} disabled={!editable} onChange={(e) => set({ [key]: v[key].map((x, j) => (j === i ? e.target.value : x)) })} />
          <Button disabled={!editable || i === 0} icon={<ArrowUpOutlined />} aria-label="Move up"
            onClick={() => { const n = [...v[key]]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set({ [key]: n }); }} />
          <Button disabled={!editable || i === v[key].length - 1} icon={<ArrowDownOutlined />} aria-label="Move down"
            onClick={() => { const n = [...v[key]]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set({ [key]: n }); }} />
          <Button disabled={!editable} danger icon={<DeleteOutlined />} aria-label="Remove option" onClick={() => set({ [key]: v[key].filter((_, j) => j !== i) })} />
        </Space.Compact>
      ))}
      {editable && (
        <Input.Search enterButton={<PlusOutlined />} placeholder="Add an option and press Enter" style={{ maxWidth: 420 }}
          onSearch={(t, e) => { if (t.trim()) { set({ [key]: [...v[key], t.trim()] }); const el = (e?.target as HTMLInputElement | undefined); if (el && 'value' in el) el.value = ''; } }} />
      )}
    </div>
  );
  return (
    <section className="panel" style={{ marginBottom: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <strong>{index + 1}.</strong>
        <span style={{ flex: 1 }} />
        {editable && <>
          <Tooltip title="Move up"><Button size="small" disabled={!onUp} icon={<ArrowUpOutlined />} onClick={onUp} /></Tooltip>
          <Tooltip title="Move down"><Button size="small" disabled={!onDown} icon={<ArrowDownOutlined />} onClick={onDown} /></Tooltip>
          <Tooltip title="Remove field"><Button size="small" danger icon={<DeleteOutlined />} onClick={onRemove} /></Tooltip>
        </>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <label style={{ gridColumn: 'span 2' }}>Title<Input value={v.title} disabled={!editable} onChange={(e) => set({ title: e.target.value })} /></label>
        <label>Type<Select value={v.type} disabled={!editable} options={typeOptions(v.type)} showSearch optionFilterProp="label" style={{ width: '100%' }} onChange={(t) => set({ type: t })} /></label>
        <label>Mandatory<div><Switch checked={v.mandatory} disabled={!editable} onChange={(m) => set({ mandatory: m })} /></div></label>
        {s.number && <>
          <label>Default<Input value={v.defaultvalue} disabled={!editable} onChange={(e) => set({ defaultvalue: e.target.value })} /></label>
          <label>Min<Input value={v.min} disabled={!editable} onChange={(e) => set({ min: e.target.value })} /></label>
          <label>Max<Input value={v.max} disabled={!editable} onChange={(e) => set({ max: e.target.value })} /></label>
        </>}
        {s.phone && <>
          <label>Prefix<Input value={v.prefix} disabled={!editable} onChange={(e) => set({ prefix: e.target.value })} /></label>
          <label>Suffix<Input value={v.sufix} disabled={!editable} onChange={(e) => set({ sufix: e.target.value })} /></label>
        </>}
        {s.subform && <label>Layout<Select value={v.formlayout || 'VERTICAL'} disabled={!editable} style={{ width: '100%' }}
          options={[{ value: 'VERTICAL', label: 'VERTICAL' }, { value: 'GRID', label: 'GRID' }]} onChange={(l) => set({ formlayout: l })} /></label>}
        {s.options && list('options', 'Options')}
        {s.other && list('defaultoptions', 'Other options')}
      </div>
    </section>
  );
}

/** A rough picture of the form as the field app lists it. */
function Preview({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="panel" style={{ padding: 16, maxWidth: 480 }}>
      <h3 style={{ marginTop: 0 }}>{title || 'Untitled form'}</h3>
      {rows.map((r) => {
        const v = viewOf(r.items);
        const label = <div style={{ fontWeight: 600, marginBottom: 4 }}>{v.title}{v.mandatory && <span style={{ color: '#d64545' }}> *</span>}</div>;
        let control: React.ReactNode = <Input disabled placeholder={v.type} />;
        if (v.type === 'paragraph') control = <Input.TextArea disabled rows={2} />;
        else if (v.type === 'switch') control = <Switch disabled />;
        else if (['dropdown', 'searchdropdown', 'filtereddropdown'].includes(v.type)) control = <Select disabled style={{ width: '100%' }} placeholder={v.options.join(' / ')} />;
        else if (v.type === 'radio' || v.type === 'multichoice' || v.type === 'multichoiceother') {
          control = <div>{[...v.options, ...v.defaultoptions].map((o) => <div key={o}><Checkbox disabled>{o}</Checkbox></div>)}</div>;
        } else if (['picture', 'gallarypicture', 'signature'].includes(v.type)) control = <Button disabled>Take {v.type === 'signature' ? 'signature' : 'photo'}</Button>;
        return <div key={r.id} style={{ marginBottom: 12 }}>{label}{control}</div>;
      })}
    </div>
  );
}
