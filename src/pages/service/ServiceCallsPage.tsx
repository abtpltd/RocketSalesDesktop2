import { useMemo, useState } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Select, TimePicker } from 'antd';
import { CalendarOutlined, ExportOutlined, ToolOutlined, UserOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { ServiceCallsPayload } from '../../api/types';
import { DATE_FMT } from '../../ui/dates';
import { Panel } from '../../ui/parts';
import SetupFrame from '../admin/SetupFrame';
import { useSetup } from '../admin/useSetup';

type Props = { classicPath: string; openClassic: (p: string) => void };
interface Values {
  engineer?: string; customer?: string; equipment?: string; spare_part?: string; date?: Dayjs; time?: [Dayjs, Dayjs];
  model?: string; serial?: string; manufacturer?: string; install_date?: Dayjs; quantity?: number; sell_mode?: string;
  location?: string; contract?: string; remark?: string;
}

/** Service Calls: schedule a call for an engineer; the engineer's app is told at once. */
export default function ServiceCallsPage({ classicPath, openClassic }: Props) {
  const { q, save, busy } = useSetup<ServiceCallsPayload>('service_calls');
  return (
    <SetupFrame q={q} title="Service Calls" meta="Schedule a visit for a service engineer" classicPath={classicPath} openClassic={openClassic}
      actions={<Button icon={<ExportOutlined />} onClick={() => openClassic(classicPath)}>Bulk upload</Button>}>
      {(d) => <CallForm d={d} save={save} busy={busy} />}
    </SetupFrame>
  );
}

function CallForm({ d, save, busy }: { d: ServiceCallsPayload; save: ReturnType<typeof useSetup<ServiceCallsPayload>>['save']; busy: string | null }) {
  const [form] = Form.useForm<Values>();
  const v = Form.useWatch([], form) as Values | undefined;
  const [last, setLast] = useState<string | null>(null);
  const equipment = d.equipments.find((e) => e.k === v?.equipment);
  const parts = useMemo(() => d.spare_parts.filter((p) => equipment && p.c === equipment.c), [d.spare_parts, equipment]);
  const engineer = d.engineers.find((e) => e.k === v?.engineer);
  const customer = d.customers.find((c) => c.k === v?.customer);
  const part = parts.find((p) => p.pc === v?.spare_part);

  const submit = async (x: Values) => {
    const r = await save('call', {
      engineer: x.engineer, customer: x.customer, equipment: x.equipment, spare_part: x.spare_part ?? '',
      date: x.date?.format('YYYY-MM-DD'), start: x.time?.[0].format('HH:mm'), end: x.time?.[1].format('HH:mm'),
      model: x.model ?? '', serial: x.serial ?? '', manufacturer: x.manufacturer ?? '', install_date: x.install_date?.format('YYYY-MM-DD') ?? '',
      quantity: x.quantity != null ? String(x.quantity) : '', sell_mode: x.sell_mode ?? '', location: x.location ?? '',
      contract: x.contract ?? '', remark: x.remark ?? '',
    }, { reload: false });
    if (r?.ok) {
      setLast(`${customer?.n ?? ''} on ${x.date?.format(DATE_FMT)} ${x.time?.[0].format('HH:mm')}`);
      form.resetFields(['customer', 'spare_part', 'time', 'model', 'serial', 'manufacturer', 'install_date', 'quantity', 'sell_mode', 'location', 'contract', 'remark']);
    }
  };
  const filter = (input: string, o?: { search?: string }) => (o?.search ?? '').includes(input.toLowerCase());

  return (
    <div className="call">
      <Form form={form} layout="vertical" requiredMark={false} onFinish={(x) => void submit(x)} initialValues={{ date: dayjs().add(1, 'day') }}>
        <Panel title="Who and where">
          <div className="form-two">
            <Form.Item name="engineer" label="Service engineer" rules={[{ required: true, message: 'Select an engineer' }]}>
              <Select showSearch placeholder="Select engineer" filterOption={filter}
                options={d.engineers.map((e) => ({ value: e.k, label: `${e.n} (${e.c})`, search: `${e.n} ${e.c} ${e.p}`.toLowerCase() }))} />
            </Form.Item>
            <Form.Item name="customer" label="Customer" rules={[{ required: true, message: 'Select a customer' }]}>
              <Select showSearch placeholder="Search name, code or phone" filterOption={filter}
                options={d.customers.map((c) => ({ value: c.k, label: `${c.n} (${c.c})`, search: `${c.n} ${c.c} ${c.ph} ${c.ar}`.toLowerCase() }))} />
            </Form.Item>
          </div>
        </Panel>
        <Panel title="Equipment">
          <div className="form-two">
            <Form.Item name="equipment" label="Equipment" rules={[{ required: true, message: 'Select the equipment' }]}>
              <Select showSearch placeholder="Select equipment" filterOption={filter} onChange={() => form.setFieldValue('spare_part', undefined)}
                options={d.equipments.map((e) => ({ value: e.k, label: `${e.n} (${e.c})`, search: `${e.n} ${e.c}`.toLowerCase() }))} />
            </Form.Item>
            <Form.Item name="spare_part" label="Spare part" rules={parts.length ? [{ required: true, message: 'Select a spare part' }] : []}
              extra={equipment && !parts.length ? 'No spare parts are listed for this equipment.' : undefined}>
              <Select showSearch placeholder={parts.length ? 'Select spare part' : 'None'} disabled={!parts.length} filterOption={filter}
                options={parts.map((p) => ({ value: p.pc, label: `${p.pn} (${p.pc}, ${p.uom})`, search: `${p.pn} ${p.pc}`.toLowerCase() }))} />
            </Form.Item>
            <Form.Item name="model" label="Model"><Input maxLength={300} /></Form.Item>
            <Form.Item name="serial" label="Serial no."><Input maxLength={300} /></Form.Item>
            <Form.Item name="manufacturer" label="Manufacturer"><Input maxLength={300} /></Form.Item>
            <Form.Item name="install_date" label="Installation date"><DatePicker format={DATE_FMT} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="quantity" label="Quantity"><InputNumber min={0} precision={0} style={{ width: '100%' }} placeholder="1" /></Form.Item>
            <Form.Item name="sell_mode" label="Sell mode"><Select allowClear placeholder="Not set" options={d.sell_modes.filter((m) => m.value)} /></Form.Item>
            <Form.Item name="location" label="Location"><Input maxLength={300} /></Form.Item>
            <Form.Item name="contract" label="Service contract name"><Input maxLength={300} /></Form.Item>
          </div>
        </Panel>
        <Panel title="When">
          <div className="form-two">
            <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Select the date' }]}><DatePicker format={DATE_FMT} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="time" label="Scheduled time" rules={[{ required: true, message: 'Select start and end time' },
              { validator: (_, t?: [Dayjs, Dayjs]) => (!t || t[1].isAfter(t[0]) ? Promise.resolve() : Promise.reject(new Error('End must be after start'))) }]}>
              <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="remark" label="SMS text"><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} /></Form.Item>
        </Panel>
      </Form>

      <aside className="call-card">
        <div className="call-card-head"><ToolOutlined /> Service call</div>
        <dl>
          <dt><UserOutlined /> Engineer</dt><dd>{engineer ? engineer.n : <span className="muted">Not chosen</span>}</dd>
          <dt>Customer</dt><dd>{customer ? <>{customer.n}<small>{[customer.c, customer.hq, customer.ar].filter(Boolean).join(', ')}</small></> : <span className="muted">Not chosen</span>}</dd>
          <dt>Equipment</dt><dd>{equipment ? <>{equipment.n}{part && <small>Part: {part.pn}</small>}</> : <span className="muted">Not chosen</span>}</dd>
          <dt><CalendarOutlined /> When</dt>
          <dd>{v?.date ? v.date.format('ddd, DD-MM-YYYY') : <span className="muted">No date</span>}{v?.time && <small>{v.time[0].format('HH:mm')} to {v.time[1].format('HH:mm')}</small>}</dd>
        </dl>
        <Button type="primary" size="large" block loading={busy === 'call'} onClick={() => form.submit()}>Schedule call</Button>
        <p className="muted">The engineer's app gets a notification straight away.</p>
        {last && <div className="call-done">Scheduled: {last}</div>}
      </aside>
    </div>
  );
}
