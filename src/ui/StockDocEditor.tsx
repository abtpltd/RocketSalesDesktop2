import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Drawer, InputNumber, Result, Select, Skeleton, Space, Table } from 'antd';
import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StockDocKind, StockDocLine } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { addAllocation, addStockIn, type DocRow } from './stockDocMath';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const TITLES: Record<StockDocKind, string> = {
  gift_stock_in: 'Gift stock IN', sample_stock_in: 'Sample stock IN',
  gift_allocation: 'New gift allocation', sample_allocation: 'New sample allocation',
};

/** Receive gift / sample stock into the store, or allocate it to reps — the same rules as the web pages. */
export default function StockDocEditor({ kind, open, onClose }: { kind: StockDocKind; open: boolean; onClose: () => void }) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['stock_doc', kind], queryFn: () => api.fetchStockDoc(kind), enabled: open, gcTime: 0, staleTime: 0 });
  const stockIn = kind.endsWith('_stock_in');
  const [rows, setRows] = useState<DocRow[]>([]);
  const [item, setItem] = useState<string | undefined>();
  const [qty, setQty] = useState<number | null>(null);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // the same id is re-sent after a timeout, so the server never runs the save twice; a refused save gets a new one
  const [requestId, setRequestId] = useState(newId);

  useEffect(() => { if (open) { setRequestId(newId()); setRows([]); setProblem(null); setItem(undefined); setQty(null); setTo([]); } }, [open, kind]);
  useEffect(() => { if (q.data) setFrom((f) => f ?? q.data.store); }, [q.data]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  const p = q.data;
  const names = useMemo(() => new Map((p?.items ?? []).map((i) => [i.id, i.name])), [p]);
  const itemOptions = useMemo(() => (p?.items ?? []).map((i) => ({ value: i.id, label: i.name })), [p]);
  const repOptions = useMemo(() => (p?.reps ?? []).map((r) => ({ value: r, label: r })), [p]);

  const add = () => {
    if (!p || !item) { setProblem('Choose an item.'); return; }
    const result = stockIn
      ? addStockIn(rows, item, names.get(item) ?? item, qty)
      : addAllocation(rows, item, names.get(item) ?? item, qty, from ?? '', to);
    if (typeof result === 'string') { setProblem(result); return; }
    setRows(result); setProblem(null); setItem(undefined); setQty(null);
    if (!stockIn) setTo([]);
  };

  const save = async () => {
    if (!rows.length) { setProblem('Add at least one item.'); return; }
    setSaving(true); setProblem(null);
    try {
      const lines: StockDocLine[] = rows.map((r) => (stockIn ? { item: r.item, qty: r.qty } : { item: r.item, qty: r.qty, from: r.from, to: r.to }));
      const res = await api.saveStockDoc(kind, { location: stockIn ? p?.store : undefined, lines, request_id: requestId });
      if (!res.ok) { setProblem(res.message || 'Not saved.'); setRequestId(newId()); return; }
      void message.success(res.message || 'Saved');
      for (const r of ['gift_stock', 'sample_stock', 'gift_allocations', 'sample_allocations']) void qc.invalidateQueries({ queryKey: ['report', r] });
      onClose();
    } catch (e) {
      const d = describeError(asAppError(e));
      setProblem(`${d.title}. ${d.text}`);
      report(e);
    } finally { setSaving(false); }
  };

  const columns = [
    { title: 'Item', dataIndex: 'name', key: 'name' },
    ...(stockIn ? [] : [{ title: 'From', dataIndex: 'from', key: 'from' }, { title: 'To', dataIndex: 'to', key: 'to' }]),
    {
      title: 'Quantity', dataIndex: 'qty', key: 'qty', align: 'right' as const,
      render: (_: unknown, r: DocRow) => (
        <InputNumber min={1} precision={0} value={r.qty} style={{ width: 110 }}
          onChange={(v) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, qty: Math.max(1, Math.floor(Number(v) || 1)) } : x)))} />
      ),
    },
    {
      title: '', key: 'del', width: 50,
      render: (_: unknown, r: DocRow) => <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove line"
        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />,
    },
  ];

  return (
    <Drawer open={open} onClose={onClose} size={Math.min(980, window.innerWidth)} destroyOnHidden title={TITLES[kind]}
      footer={p && (
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!rows.length} onClick={() => void save()}>
            {stockIn ? `Receive into ${p.store}` : 'Allocate'}
          </Button>
        </Space>
      )}>
      {q.isPending && <Skeleton active />}
      {q.isError && <Result status="warning" title={describeError(asAppError(q.error)).title} subTitle={describeError(asAppError(q.error)).text} />}
      {p && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            {stockIn ? `Stock is received into ${p.store}. Lines with 0 are left out.`
              : 'Each item can go to a rep only once in one allocation. The stock lists show what each store and rep holds.'}
          </p>
          <div className="filters" style={{ flexWrap: 'wrap' }}>
            <Select showSearch placeholder="Item" style={{ minWidth: 260 }} optionFilterProp="label" options={itemOptions}
              value={item} onChange={setItem} />
            {!stockIn && (
              <>
                <Select showSearch placeholder="From" style={{ minWidth: 200 }} value={from} onChange={setFrom}
                  options={p.from_places.map((f) => ({ value: f, label: f }))} />
                <Select showSearch allowClear placeholder="Add a manager's reps" style={{ minWidth: 200 }} value={null}
                  options={Object.keys(p.managers).sort().map((m) => ({ value: m, label: m }))}
                  onChange={(m) => { if (m) setTo((t) => Array.from(new Set([...t, ...(p.managers[m] ?? [])]))); }} />
                <Select mode="multiple" showSearch placeholder="To rep(s)" style={{ minWidth: 280 }} maxTagCount="responsive"
                  options={repOptions} value={to} onChange={setTo} />
              </>
            )}
            <InputNumber min={1} precision={0} placeholder="Quantity" value={qty} onChange={(v) => setQty(v == null ? null : Number(v))}
              onPressEnter={add} />
            <Button icon={<PlusOutlined />} onClick={add}>Add</Button>
          </div>
          {problem && <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problem} />}
          <Table size="small" rowKey="key" columns={columns} dataSource={rows} pagination={false}
            locale={{ emptyText: 'No lines yet' }}
            summary={() => rows.length ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={stockIn ? 1 : 3}>{rows.length} line(s)</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">{rows.reduce((s, r) => s + r.qty, 0).toLocaleString()}</Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
              </Table.Summary.Row>
            ) : null} />
        </>
      )}
    </Drawer>
  );
}
