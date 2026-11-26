import MoreMenu from '../../ui/MoreMenu';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Empty, Form, Input, InputNumber, Select, Switch, Table, Tabs, Tag, Tooltip } from 'antd';
import {
  ArrowLeftOutlined, ArrowRightOutlined, CheckCircleFilled, EditOutlined, MinusCircleFilled, PlusOutlined, SaveOutlined, UndoOutlined,
} from '@ant-design/icons';
import type { CompanySettingsPayload, SalesPerson, WorkflowStep } from '../../api/types';
import { Panel } from '../../ui/parts';
import SetupFrame from './SetupFrame';
import { useSetup } from './useSetup';

type Save = ReturnType<typeof useSetup<CompanySettingsPayload>>['save'];
type Props = { classicPath: string; openClassic: (p: string) => void };

/** Company settings: the System, Med Rep and Dashboard tabs of the web Settings page (administrators only). */
export default function CompanySettingsPage({ classicPath, openClassic }: Props) {
  const { q, save, busy } = useSetup<CompanySettingsPayload>('company_settings');
  const [tab, setTab] = useState('system');
  return (
    <SetupFrame q={q} title="Company settings" meta="System, sales people and dashboard settings for the whole company"
      classicPath={classicPath} openClassic={openClassic}>
      {(d) => (
        <Tabs activeKey={tab} onChange={setTab} className="admin-tabs" items={[
          { key: 'system', label: 'System', children: <SystemTab d={d} save={save} busy={busy} openClassic={() => openClassic(classicPath)} /> },
          { key: 'medrep', label: 'Med Rep', children: <SalesPeople d={d} save={save} busy={busy} /> },
          { key: 'dashboard', label: 'Dashboard', children: <DashboardTab d={d} save={save} busy={busy} /> },
        ]} />
      )}
    </SetupFrame>
  );
}

function SystemTab({ d, save, busy, openClassic }: { d: CompanySettingsPayload; save: Save; busy: string | null; openClassic: () => void }) {
  const [sms, setSms] = useState(d.sms);
  const [table, setTable] = useState(d.order_table);
  const [status, setStatus] = useState('');
  useEffect(() => setSms(d.sms), [d.sms]);
  useEffect(() => setTable(d.order_table), [d.order_table]);
  const insert = (word: string) => setSms((s) => `${s}${s && !s.endsWith(' ') ? ' ' : ''}${word}`);
  const tableDirty = JSON.stringify(table) !== JSON.stringify(d.order_table);
  return (
    <div className="admin-grid">
      <Panel title="Customer tag verification SMS" sub="Sent to the customer when a rep geotags them. Click a keyword to add it.">
        <Input.TextArea value={sms} onChange={(e) => setSms(e.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} maxLength={1000} />
        <div className="admin-row">
          <span className="muted">Keywords</span>
          <Tag className="kw" onClick={() => insert('{Organization}')}>{'{Organization}'} company title</Tag>
          <Tag className="kw" onClick={() => insert('{Customer}')}>{'{Customer}'} customer name</Tag>
          <span className="grow" />
          <Button type="primary" icon={<SaveOutlined />} disabled={sms === d.sms} loading={busy === 'sms'}
            onClick={() => void save('sms', { sms, base: d.base.sms })}>Save SMS</Button>
        </div>
      </Panel>

      <Panel title="Order details table" sub="What the order details page shows for each line.">
        <div className="switch-list">
          <label><Switch checked={table.show_tax} onChange={(v) => setTable({ ...table, show_tax: v })} /> Show tax %</label>
          <label><Switch checked={table.product_code} onChange={(v) => setTable({ ...table, product_code: v })} /> Show product code</label>
          <label><Switch checked={table.customer_code} onChange={(v) => setTable({ ...table, customer_code: v })} /> Show customer's product code and description</label>
        </div>
        <Form layout="vertical" style={{ marginTop: 14 }}>
          <Form.Item label="Email for items left out of PDF orders" style={{ marginBottom: 8 }}>
            <Input type="email" value={table.skip_email} onChange={(e) => setTable({ ...table, skip_email: e.target.value })} placeholder="name@company.com" />
          </Form.Item>
        </Form>
        <div className="admin-row"><span className="grow" />
          <Button type="primary" icon={<SaveOutlined />} disabled={!tableDirty} loading={busy === 'order_table'}
            onClick={() => void save('order_table', { order_table: table, base: d.base.order_table })}>Save order details</Button>
        </div>
      </Panel>

      <Workflow d={d} save={save} busy={busy} />

      <Panel title="Order item line status" sub="Statuses a person can give each line of an order. Statuses can be added, not removed.">
        <div className="chip-row">
          {d.line_status.length ? d.line_status.map((s) => <Tag key={s} color="blue">{s}</Tag>) : <span className="muted">No line statuses yet</span>}
        </div>
        <div className="admin-row">
          <Input style={{ maxWidth: 280 }} placeholder="New line status" value={status} maxLength={60} onChange={(e) => setStatus(e.target.value)}
            onPressEnter={() => status.trim() && void save('line_status', { line_status: status.trim(), base: d.base.line_status }).then((r) => r?.ok && setStatus(''))} />
          <Button icon={<PlusOutlined />} disabled={!status.trim()} loading={busy === 'line_status'}
            onClick={() => void save('line_status', { line_status: status.trim(), base: d.base.line_status }).then((r) => r?.ok && setStatus(''))}>Add status</Button>
        </div>
      </Panel>

      <Panel title="Still on the web page" sub="These settings have many options and stay in the classic window for now.">
        <ul className="web-only">
          <li>Order Excel export formats, custom fields and the default and automation formats</li>
          {d.sequence_on_web && <li>Order number sequence</li>}
        </ul>
        <MoreMenu items={[{ key: 'classic', label: 'Open in classic window', onClick: () => openClassic() }]} />
      </Panel>
    </div>
  );
}

function Workflow({ d, save, busy }: { d: CompanySettingsPayload; save: Save; busy: string | null }) {
  const [steps, setSteps] = useState<WorkflowStep[]>(d.workflow);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { setSteps(d.workflow); setSel(null); }, [d.workflow]);
  const dirty = JSON.stringify(steps) !== JSON.stringify(d.workflow);
  const roleOptions = useMemo(() => {
    const all = new Set(d.roles);
    steps.forEach((s) => s.role.split(',').filter(Boolean).forEach((r) => all.add(r)));
    return [...all].map((r) => ({ value: r, label: d.roles.includes(r) ? r : `${r} (no longer a role)` }));
  }, [d.roles, steps]);
  const edit = (patch: Partial<WorkflowStep>) => sel != null && setSteps(steps.map((s, i) => (i === sel ? { ...s, ...patch } : s)));
  const move = (by: number) => {
    if (sel == null) return;
    const to = sel + by;
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    [next[sel], next[to]] = [next[to], next[sel]];
    setSteps(next); setSel(to);
  };
  const cur = sel != null ? steps[sel] : null;
  const dup = cur && steps.some((s, i) => i !== sel && s.stage.trim().toLowerCase() === cur.stage.trim().toLowerCase());
  return (
    <Panel title="Order workflow" sub="Each stage moves an order on. Only the roles chosen for a stage can do it. Switched-off stages are skipped."
      extra={<div className="admin-row tight">
        <Button icon={<UndoOutlined />} disabled={!dirty} onClick={() => { setSteps(d.workflow); setSel(null); }}>Discard</Button>
        <Button type="primary" icon={<SaveOutlined />} disabled={!dirty || !!dup || steps.some((s) => !s.stage.trim())} loading={busy === 'workflow'}
          onClick={() => void save('workflow', { workflow: steps, base: d.base.workflow })}>Save workflow</Button>
      </div>}>
      <div className="flow">
        {steps.map((s, i) => (
          <div key={i} className="flow-step-wrap">
            <button type="button" className={`flow-step${s.active ? '' : ' off'}${sel === i ? ' sel' : ''}`} onClick={() => setSel(i)}>
              {s.active ? <CheckCircleFilled /> : <MinusCircleFilled />}
              <span><b>{s.stage || 'New stage'}</b><small>{s.role ? s.role.split(',').join(', ') : 'No roles'}</small></span>
            </button>
            {i < steps.length - 1 && <ArrowRightOutlined className="flow-arrow" />}
          </div>
        ))}
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => { setSteps([...steps, { active: true, stage: '', role: 'ADMIN' }]); setSel(steps.length); }}>Stage</Button>
      </div>
      {cur ? (
        <div className="flow-edit">
          <Form layout="vertical">
            <div className="flow-edit-grid">
              <Form.Item label="Stage" validateStatus={!cur.stage.trim() || dup ? 'error' : ''} help={dup ? 'Another stage has this name' : undefined}>
                <Input value={cur.stage} maxLength={60} onChange={(e) => edit({ stage: e.target.value.replace(/["\\]/g, '') })} autoFocus={!cur.stage} />
              </Form.Item>
              <Form.Item label="Roles that can do it">
                <Select mode="multiple" value={cur.role.split(',').filter(Boolean)} options={roleOptions} onChange={(v: string[]) => edit({ role: v.join(',') })} />
              </Form.Item>
              <Form.Item label="In use"><Switch checked={cur.active} onChange={(v) => edit({ active: v })} /></Form.Item>
            </div>
          </Form>
          <div className="admin-row tight">
            <Tooltip title="Earlier"><Button icon={<ArrowLeftOutlined />} disabled={sel === 0} onClick={() => move(-1)} /></Tooltip>
            <Tooltip title="Later"><Button icon={<ArrowRightOutlined />} disabled={sel === steps.length - 1} onClick={() => move(1)} /></Tooltip>
            <span className="muted">Stages are switched off rather than removed, as on the web page.</span>
          </div>
        </div>
      ) : <div className="muted" style={{ marginTop: 10 }}>Click a stage to change it.</div>}
    </Panel>
  );
}

function SalesPeople({ d, save, busy }: { d: CompanySettingsPayload; save: Save; busy: string | null }) {
  const [find, setFind] = useState('');
  const [open, setOpen] = useState<SalesPerson | 'new' | null>(null);
  const [form] = Form.useForm();
  const rows = d.salesmen.filter((s) => !find || `${s.name} ${s.code} ${s.phone} ${s.role}`.toLowerCase().includes(find.toLowerCase()));
  const start = (p: SalesPerson | 'new') => {
    setOpen(p);
    form.setFieldsValue(p === 'new' ? { name: '', role: 'Rep', code: '', phone: '' } : { name: p.name, role: p.role || 'Rep', code: p.code, phone: p.phone });
  };
  const submit = async (v: { name: string; role: string; code: string; phone: string }) => {
    const r = await save('salesman', { salesman: { ...v, key: open === 'new' ? '' : open?.key }, base: d.base.salesmen });
    if (r?.ok) setOpen(null);
  };
  return (
    <Panel flush title="Sales people" sub={`${d.salesmen.length} people. Used for order sales person names and manager mapping.`}
      extra={<div className="admin-row tight">
        <Input.Search allowClear placeholder="Find" value={find} onChange={(e) => setFind(e.target.value)} style={{ width: 220 }} />
        <Button type="primary" icon={<PlusOutlined />} disabled={d.odoo} onClick={() => start('new')}>Add sales person</Button>
      </div>}>
      {d.odoo && <Alert type="info" showIcon style={{ margin: '0 16px 12px' }} title="Sales people come from the ERP for this company. Only the role can be changed here." />}
      <Table<SalesPerson> rowKey="key" size="middle" dataSource={rows} pagination={{ pageSize: 25, showSizeChanger: false }}
        locale={{ emptyText: <Empty description="No sales people" /> }}
        columns={[
          { title: 'Name', dataIndex: 'name', sorter: (a, b) => a.name.localeCompare(b.name), defaultSortOrder: 'ascend' },
          { title: 'Role', dataIndex: 'role', width: 130, sorter: (a, b) => a.role.localeCompare(b.role),
            render: (r: string) => <Tag color={r === 'Manager' ? 'purple' : r === 'Supervisor' ? 'gold' : 'blue'}>{r}</Tag> },
          { title: 'Rep code', dataIndex: 'code', width: 120, sorter: (a, b) => a.code.localeCompare(b.code) },
          { title: 'Phone', dataIndex: 'phone', width: 150 },
          { title: 'RS code', dataIndex: 'rs_code', width: 100 },
          { title: 'Pick type', dataIndex: 'picking_type', width: 100, render: (v: number) => v || '' },
          { title: '', key: 'edit', width: 60, render: (_, p) => <Tooltip title="Change"><Button type="text" icon={<EditOutlined />} onClick={() => start(p)} /></Tooltip> },
        ]} />
      <Drawer open={open != null} onClose={() => setOpen(null)} title={open === 'new' ? 'Add sales person' : 'Change sales person'} size={420} destroyOnHidden
        extra={<Button type="primary" icon={<SaveOutlined />} loading={busy === 'salesman'} onClick={() => form.submit()}>Save</Button>}>
        <Form form={form} layout="vertical" onFinish={(v) => void submit(v)} requiredMark={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter the name' }]}
            extra={open !== 'new' && !d.odoo ? 'Names are saved in capitals, as on the web.' : undefined}>
            <Input disabled={d.odoo} maxLength={100} />
          </Form.Item>
          <Form.Item name="role" label="Role"><Select options={d.sales_roles.map((r) => ({ value: r, label: r }))} /></Form.Item>
          <Form.Item name="code" label="Rep code"><Input disabled={d.odoo} maxLength={40} /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input disabled={d.odoo} maxLength={40} /></Form.Item>
        </Form>
        <div className="muted">Sales people cannot be removed from the desktop app. Removing one deletes it for good on the web page.</div>
      </Drawer>
    </Panel>
  );
}

function DashboardTab({ d, save, busy }: { d: CompanySettingsPayload; save: Save; busy: string | null }) {
  const [v, setV] = useState(d.dashboard);
  useEffect(() => setV(d.dashboard), [d.dashboard]);
  const ok = (n: number | null) => n != null && n >= 5 && n <= 20;
  return (
    <Panel title="Top counts" sub="How many products and customers the dashboard's top lists show (5 to 20).">
      <div className="admin-row">
        <label className="num-field">Top products <InputNumber min={5} max={20} value={v.top_products} onChange={(n) => setV({ ...v, top_products: n ?? 0 })} /></label>
        <label className="num-field">Top customers <InputNumber min={5} max={20} value={v.top_customers} onChange={(n) => setV({ ...v, top_customers: n ?? 0 })} /></label>
        <span className="grow" />
        <Button type="primary" icon={<SaveOutlined />} loading={busy === 'dashboard'}
          disabled={!ok(v.top_products) || !ok(v.top_customers) || JSON.stringify(v) === JSON.stringify(d.dashboard)}
          onClick={() => void save('dashboard', { dashboard: v, base: d.base.dashboard })}>Save</Button>
      </div>
    </Panel>
  );
}
