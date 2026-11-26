import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Descriptions, Drawer, InputNumber, Result, Select, Skeleton, Space, Table, Tag } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/** Approve a rep's stock request and move the stock, as the web "Stock Request Approved And Transfer" page. */
export default function StockRequestDrawer({ requestKey, onClose }: { requestKey: string | null; onClose: () => void }) {
  const { api, report } = useSession();
  const { message, modal } = AntApp.useApp();
  const qc = useQueryClient();
  const open = !!requestKey;
  const q = useQuery({ queryKey: ['stock_request', requestKey], queryFn: () => api.fetchStockRequest(requestKey!), enabled: open, gcTime: 0, staleTime: 0 });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [from, setFrom] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // the same id is re-sent after a timeout, so the server never runs the save twice; a refused save gets a new one
  const [requestId, setRequestId] = useState(newId);
  useEffect(() => {
    if (q.data) { setRequestId(newId()); setQty(Object.fromEntries(q.data.lines.map((l) => [l.item, Number(l.qty) || 0]))); setFrom(undefined); setProblem(null); }
  }, [q.data]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const p = q.data;
  const total = Object.values(qty).reduce((s, v) => s + (v > 0 ? v : 0), 0);

  const approve = () => {
    if (!p) return;
    if (!from) { setProblem('Select the store or rep the stock comes from.'); return; }
    if (!total) { setProblem('Line items quantity missing.'); return; }
    modal.confirm({
      title: 'Approve and transfer?', okText: 'Approve and transfer',
      content: `${total.toLocaleString()} item(s) will move from ${from} to ${p.to}. This cannot be undone here.`,
      onOk: async () => {
        setSaving(true); setProblem(null);
        try {
          const res = await api.approveStockRequest({ key: p.key, from, request_id: requestId, lines: p.lines.map((l) => ({ item: l.item, qty: qty[l.item] ?? 0 })) });
          if (!res.ok) { setProblem(res.message || 'Not saved.'); setRequestId(newId()); return; }
          void message.success(res.message || 'Approved');
          for (const r of ['stock_requests', 'gift_stock', 'sample_stock']) void qc.invalidateQueries({ queryKey: ['report', r] });
          onClose();
        } catch (e) {
          const d = describeError(asAppError(e));
          setProblem(`${d.title}. ${d.text}`);
          report(e);
        } finally { setSaving(false); }
      },
    });
  };

  return (
    <Drawer open={open} onClose={onClose} size={Math.min(760, window.innerWidth)} destroyOnHidden title={p ? `Stock request ${p.doc_number}` : 'Stock request'}
      footer={p && !p.approved && (
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>Close</Button>
          <Button type="primary" icon={<CheckOutlined />} loading={saving} onClick={approve}>Approve and transfer</Button>
        </Space>
      )}>
      {q.isPending && open && <Skeleton active />}
      {q.isError && <Result status="warning" title={describeError(asAppError(q.error)).title} subTitle={describeError(asAppError(q.error)).text} />}
      {p && (
        <>
          <Descriptions size="small" column={2} style={{ marginBottom: 12 }} items={[
            { key: 't', label: 'Type', children: p.stock_type },
            { key: 'to', label: 'For', children: p.to },
            { key: 's', label: 'Status', children: p.approved ? <Tag color="green">Approved</Tag> : <Tag color="gold">Waiting</Tag> },
          ]} />
          {p.approved && <Alert type="success" showIcon style={{ marginBottom: 12 }} title="This request is approved and its stock was transferred." />}
          {!p.approved && (
            <div className="filters">
              <span>From</span>
              <Select showSearch placeholder="Select store or rep" style={{ minWidth: 260 }} value={from} onChange={setFrom}
                options={p.from_places.filter((f) => f !== p.to).map((f) => ({ value: f, label: f }))} />
            </div>
          )}
          {problem && <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problem} />}
          <Table size="small" rowKey="item" pagination={false} dataSource={p.lines} columns={[
            { title: 'Item', dataIndex: 'name', key: 'name' },
            { title: 'Requested', dataIndex: 'qty', key: 'req', align: 'right' as const },
            { title: 'Transfer', key: 'q', align: 'right' as const, render: (_: unknown, l: { item: string }) => (
              <InputNumber min={0} precision={0} disabled={p.approved} value={qty[l.item] ?? 0} style={{ width: 110 }}
                onChange={(v) => setQty((x) => ({ ...x, [l.item]: Math.max(0, Math.floor(Number(v) || 0)) }))} />) },
          ]} />
        </>
      )}
    </Drawer>
  );
}
