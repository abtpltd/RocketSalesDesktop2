import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App as AntApp, Button, Drawer, Input, InputNumber, Result, Select, Skeleton, Space, Table, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { EditLine, EditProduct } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { parseQty, priceLine, sumLines } from './orderMath';

const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
type Row = EditLine & { key: string; error?: string };

/** Edit the products of an order or quotation, like the web's Edit popup. The server prices the lines again on save. */
export default function OrderEditor({ kind, orderKey, open, onClose }: {
  kind: 'order' | 'quotation'; orderKey: string; open: boolean; onClose: () => void;
}) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['order_edit', kind, orderKey], queryFn: () => api.fetchOrderEdit(kind, orderKey), enabled: open, gcTime: 0, staleTime: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  const [remark, setRemark] = useState('');
  const [baseName, setBaseName] = useState('');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pick, setPick] = useState<string | undefined>();
  const [addQty, setAddQty] = useState('');
  const [addRate, setAddRate] = useState<number>(0);
  const [addDisc, setAddDisc] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const requestId = useMemo(() => newId(), [open, orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!q.data?.lines) return;
    setRows(q.data.lines.map((l, i) => ({ ...l, key: `s${i}` })));
    setRemark(q.data.remark ?? '');
    setBaseName(q.data.base_price ?? '');
    setProblem(null);
  }, [q.data]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  useEffect(() => {
    if (!open || !baseName) { setPrices({}); return; }
    api.fetchBasePrices(baseName).then((r) => setPrices(r.base_price ?? {})).catch((e) => { setPrices({}); report(e); });
  }, [api, baseName, open, report]);

  const products = useMemo(() => new Map((q.data?.products ?? []).map((p) => [p.code, p])), [q.data]);
  const options = useMemo(() => (q.data?.products ?? []).map((p) => ({ value: p.code, label: `${p.name}-${p.code}` })), [q.data]);
  const totals = useMemo(() => sumLines(rows), [rows]);

  const change = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r, ...patch };
      const qty = parseQty(String(next.qty ?? ''), next.uc);
      if (!qty) return { ...next, error: 'Quantity must look like 5 or 5.3' };
      return { ...priceLine({ ...next, rate: Math.abs(Number(next.rate) || 0), discount: Math.abs(Number(next.discount) || 0) }, qty.q1, qty.q2), key, qty: qty.text, error: undefined };
    }));
  };

  const choose = (code?: string) => {
    setPick(code);
    const p = code ? products.get(code) : undefined;
    if (!p) return;
    setAddRate(prices[p.code] ?? p.mrp);
    setAddDisc(p.d ?? 0);
    setAddQty('');
    setTimeout(() => qtyRef.current?.focus(), 50);
  };

  const add = () => {
    const p: EditProduct | undefined = pick ? products.get(pick) : undefined;
    if (!p) { void message.error('Select a product'); return; }
    const qty = parseQty(addQty.replace(/ /g, ''), p.uc);
    if (!qty) { void message.error('Quantity missing'); return; }
    if (rows.some((r) => r.code === p.code) && addDisc !== 100) { void message.error('Product already in the list'); return; }
    const base: EditLine = { index: null, code: p.code, name: p.name, uom: p.uom, uc: p.uc, qty: qty.text, rate: Math.abs(addRate || 0),
      discount: Math.abs(addDisc || 0), tax: p.tx, act_wt: p.wt ?? 0 };
    setRows((rs) => [...rs, { ...priceLine(base, qty.q1, qty.q2), key: `n${Date.now()}` }]);
    setPick(undefined); setAddQty('');
  };

  const save = async () => {
    if (!rows.length) { setProblem('The list needs at least one product.'); return; }
    if (rows.some((r) => r.error)) { setProblem('Fix the quantities marked in red first.'); return; }
    setSaving(true); setProblem(null);
    try {
      const res = await api.saveOrderEdit({
        kind, key: orderKey, remark, request_id: `${requestId}-${Date.now()}`,
        lines: rows.map((r) => ({ index: r.index ?? null, code: r.code, qty: String(r.qty), rate: Number(r.rate), discount: Number(r.discount) })),
      });
      if (!res.ok) { setProblem(res.message || 'Not saved.'); return; }
      void message.success(kind === 'order' ? 'Order updated' : 'Quotation updated');
      void qc.invalidateQueries({ queryKey: ['order', orderKey] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['report', 'quotations'] });
      onClose();
    } catch (e) {
      const d = describeError(asAppError(e));
      setProblem(`${d.title}. ${d.text}`);
      report(e);
    } finally { setSaving(false); }
  };

  const p = q.data;
  return (
    <Drawer open={open} onClose={onClose} size={Math.min(1180, window.innerWidth)} destroyOnHidden
      title={p ? `Edit ${kind} ${p.number} · ${p.customer}` : 'Loading...'}
      footer={p?.editable && (
        <div className="form-foot">
          <span className="muted">SubTotal <b>{money(totals.sub)}</b> · VAT <b>{money(totals.vat)}</b> · Grand total <b>{money(totals.gt)}</b></span>
          <span style={{ flex: 1 }} />
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()}>Save changes</Button>
        </div>
      )}>
      {q.isPending && <Skeleton active paragraph={{ rows: 10 }} />}
      {q.isError && <Result status="warning" title={describeError(asAppError(q.error)).title} subTitle={describeError(asAppError(q.error)).text} />}
      {p && !p.editable && <Alert type="info" showIcon title="This cannot be edited" description={p.reason} />}
      {problem && <Alert type="error" showIcon title="Not saved" description={problem} style={{ marginBottom: 12 }} />}
      {p?.editable && (
        <>
          <div className="filters">
            <Select showSearch allowClear placeholder="Add a product..." style={{ minWidth: 360, flex: 1 }} value={pick} options={options}
              optionFilterProp="label" onChange={choose} />
            <Input ref={qtyRef as never} placeholder="Qty (5 or 5.3)" style={{ width: 130 }} value={addQty}
              onChange={(e) => setAddQty(e.target.value)} onPressEnter={add} />
            <Tooltip title="Price"><InputNumber min={0} style={{ width: 120 }} value={addRate} onChange={(v) => setAddRate(Number(v) || 0)} /></Tooltip>
            <Tooltip title="Discount %"><InputNumber min={0} max={100} style={{ width: 90 }} value={addDisc} onChange={(v) => setAddDisc(Number(v) || 0)} /></Tooltip>
            <Button icon={<PlusOutlined />} onClick={add}>Add</Button>
            <Select style={{ minWidth: 180 }} allowClear placeholder="Base price list" value={baseName || undefined}
              options={(p.base_price_lists ?? []).map((n) => ({ value: n, label: n }))} onChange={(v) => setBaseName(v ?? '')} />
          </div>
          <div className="panel flush">
            <Table<Row> size="small" rowKey="key" dataSource={rows} pagination={false} scroll={{ x: 'max-content', y: 'calc(100vh - 360px)' }}
              columns={[
                { title: 'Product', dataIndex: 'name', render: (v, r) => <span>{v} <span className="muted">{r.code}</span></span> },
                { title: 'UOM', dataIndex: 'uom', width: 90 },
                { title: 'Qty', dataIndex: 'qty', width: 120, render: (v, r) => (
                  <Input size="small" status={r.error ? 'error' : undefined} value={String(v ?? '')} title={r.error}
                    onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)))}
                    onBlur={(e) => change(r.key, { qty: e.target.value })} onPressEnter={(e) => change(r.key, { qty: (e.target as HTMLInputElement).value })} />
                ) },
                { title: 'Price', dataIndex: 'rate', width: 130, render: (v, r) => (
                  <InputNumber size="small" min={0} style={{ width: '100%' }} value={Number(v)} onChange={(n) => change(r.key, { rate: Number(n) || 0 })} />
                ) },
                { title: 'Disc %', dataIndex: 'discount', width: 100, render: (v, r) => (
                  <InputNumber size="small" min={0} max={100} style={{ width: '100%' }} value={Number(v)} onChange={(n) => change(r.key, { discount: Number(n) || 0 })} />
                ) },
                { title: 'Tax %', dataIndex: 'tax', width: 70, align: 'right' },
                { title: 'Total', dataIndex: 'total', width: 130, align: 'right', render: (v) => money(Number(v) || 0) },
                { title: '', key: 'x', width: 48, render: (_, r) => (
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove line"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
                ) },
              ]} />
          </div>
          <Space style={{ width: "100%" }} orientation="vertical">
            <span className="muted">Remarks</span>
            <Input.TextArea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={2000} />
            <Button size="small" icon={<UndoOutlined />} onClick={() => void q.refetch()}>Start again from the saved {kind}</Button>
          </Space>
        </>
      )}
    </Drawer>
  );
}
