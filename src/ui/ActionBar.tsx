import { useMemo, useState } from 'react';
import { App as AntApp, Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Table } from 'antd';
import { UndoOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import type { RecordAction } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { useCan } from '../access';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/** The record's buttons (approve, hold, verify...). The server only lists what the web page would show. */
export default function ActionBar({ actions: all, recordKey, refresh, size, iconOnly }: {
  actions: RecordAction[]; recordKey: string; refresh: string[][]; size?: 'small' | 'middle'; /** show a reset icon instead of the label (App users) */ iconOnly?: boolean;
}) {
  const canCancel = useCan('delete');
  const canApprove = useCan('approve');
  // cancel needs Delete, everything else (approve, verify, hold, reject) needs Approve; the server checks again
  const actions = all.filter((a) => (a.name.endsWith('cancel') ? canCancel : canApprove));
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<RecordAction | null>(null);
  const [form] = Form.useForm();
  const base = useMemo(() => newId(), [recordKey]);

  const run = async (a: RecordAction, extra: Record<string, unknown> = {}) => {
    setBusy(a.name);
    try {
      const res = await api.runAction(a.name, { key: recordKey, ...extra, request_id: `${base}-${a.name}-${Date.now()}` });
      if (res.ok) void message.success(res.message || 'Done'); else void message.error(res.message || 'Not done');
      for (const k of refresh) void qc.invalidateQueries({ queryKey: k });
      setAsking(null);
    } catch (e) {
      const d = describeError(asAppError(e));
      void message.error(`${d.title}. ${d.text}`);
      report(e);
    } finally { setBusy(null); }
  };

  const ask = (a: RecordAction) => {
    form.setFieldsValue(Object.fromEntries(Object.entries(a.needs ?? {}).map(([k, v]) => [k, v.default ?? ''])));
    setAsking(a);
  };

  if (!actions.length) return null;
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Space wrap size={6}>
        {actions.map((a) => {
          const danger = a.name.endsWith('cancel');
          if (a.needs && iconOnly) return <Button key={a.name} size={size} danger icon={<UndoOutlined />} title={a.label} aria-label={a.label} loading={busy === a.name} onClick={() => ask(a)} />;
          if (a.needs) return <Button key={a.name} size={size} danger={danger} loading={busy === a.name} onClick={() => ask(a)}>{a.label}</Button>;
          if (a.confirm) {
            return (
              <Popconfirm key={a.name} title={a.label} description={a.confirm} okText={a.label} okButtonProps={{ danger }} onConfirm={() => void run(a)}>
                <Button size={size} danger={danger} loading={busy === a.name}>{a.label}</Button>
              </Popconfirm>
            );
          }
          return <Button key={a.name} size={size} type="primary" loading={busy === a.name} onClick={() => void run(a)}>{a.label}</Button>;
        })}
      </Space>
      <Modal open={!!asking} width={asking && Object.values(asking.needs ?? {}).some((n) => n.kind === 'expenses') ? 640 : undefined} title={asking?.label} okText={asking?.label} confirmLoading={!!busy} destroyOnHidden
        onCancel={() => setAsking(null)} onOk={() => void form.validateFields().then((v) => asking && run(asking, v))}>
        <Form form={form} layout="vertical" requiredMark={false}>
          {Object.entries(asking?.needs ?? {}).map(([k, v]) => v.kind === 'expenses' ? (
            <Form.Item key={k} label={v.label}>
              <Form.List name={k}>
                {(fields) => (
                  <Table size="small" pagination={false} rowKey="key" dataSource={fields}
                    columns={[
                      { title: 'Expense', key: 'h', render: (_, f) => <Form.Item noStyle name={[f.name, 'head']}><Input variant="borderless" readOnly /></Form.Item> },
                      { title: 'Type', key: 't', render: (_, f) => <Form.Item noStyle name={[f.name, 'type']}><Input variant="borderless" readOnly /></Form.Item> },
                      { title: 'Amount', key: 'a', width: 140, render: (_, f) => <Form.Item noStyle name={[f.name, 'amount']}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item> },
                    ]} />
                )}
              </Form.List>
              <div className="muted" style={{ marginTop: 6 }}>Only amounts above 0 are approved.</div>
            </Form.Item>
          ) : (
            <Form.Item key={k} name={k} label={v.label} rules={v.optional || v.kind === 'number' ? undefined : [{ required: true, whitespace: true, message: `Enter ${v.label.toLowerCase()}` }]}>
              {v.kind === 'number' ? <InputNumber min={0} style={{ width: '100%' }} />
                : k === 'remark' || k === 'remarks' ? <Input.TextArea autoFocus rows={3} maxLength={1000} /> : <Input autoFocus />}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </span>
  );
}
