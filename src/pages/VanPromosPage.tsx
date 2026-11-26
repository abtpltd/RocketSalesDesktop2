import { DATE_FMT, showDate } from '../ui/dates';
import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, DatePicker, Drawer, Input, InputNumber, Modal, Result, Select, Space, Switch, Table, Tag } from 'antd';
import { DeleteOutlined, HistoryOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { PromoLine, PromoOffer, VanPromosPayload } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import { LINE_FIELDS, blankLine, groupLines, lineProblem } from './promoMath';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const today = () => dayjs().format('YYYY-MM-DD');
interface Draft { index: number | null; base?: string; type: string; title: string; active: boolean; start: string; end: string; categories: string[]; lines: PromoLine[] }

/** App Promo (the web "RocketVanPromo" page): offers the field app applies on orders. Offers are switched off, never removed. */
export default function VanPromosPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const q = useQuery({ queryKey: ['setup', 'van_promos'], queryFn: () => api.fetchSetup<VanPromosPayload>('van_promos'), staleTime: 0 });
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState<string | undefined>();
  const [history, setHistory] = useState(false);
  const p = q.data;
  const rows = useMemo(() => (p?.offers ?? []).filter((o) =>
    (!search || o.title.toLowerCase().includes(search.toLowerCase()) || o.type.toLowerCase().includes(search.toLowerCase()))
    && (!product || o.codes.includes(product))), [p, search, product]);

  if (q.isPending) return <StillLoading />;
  if (q.isError || !p) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  const edit = (o: PromoOffer) => setDraft({ index: o.index, base: o.base, type: o.type, title: o.title, active: o.active,
    start: o.start || today(), end: o.end || today(), categories: o.categories, lines: o.lines.map((l) => ({ ...l })) });

  return (
    <>
      <div className="page-title">
        <h2>{p.title}</h2>
        <span className="muted">{p.offers.length} offers</span>
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistory(true)}>Edit history</Button>
        <Button size="small" type="primary" icon={<PlusOutlined />}
          onClick={() => setDraft({ index: null, type: '', title: '', active: true, start: today(), end: today(), categories: [], lines: [] })}>New offer</Button>
      </div>
      <div className="filters">
        <Input.Search allowClear placeholder="Search title or type" style={{ maxWidth: 280 }} onChange={(e) => setSearch(e.target.value)} />
        <Select showSearch allowClear placeholder="Offers that include a product" style={{ minWidth: 300 }} value={product} onChange={setProduct}
          optionFilterProp="label" options={p.products.map((x) => ({ value: x.c, label: `${x.n} - ${x.c}` }))} />
      </div>
      <div className="panel flush">
        <Table size="small" rowKey="index" dataSource={rows} pagination={{ pageSize: 50, hideOnSinglePage: true }}
          onRow={(o) => ({ onClick: () => edit(o), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Title', dataIndex: 'title', key: 'title' },
            { title: 'Offer type', dataIndex: 'type', key: 'type' },
            { title: 'Status', key: 's', render: (_: unknown, o: PromoOffer) => (o.active ? <Tag color="green">Active</Tag> : <Tag>Expired</Tag>) },
            { title: 'From', dataIndex: 'start', key: 'sd', render: (v: unknown) => String(showDate(v) ?? '') }, { title: 'To', dataIndex: 'end', key: 'ed', render: (v: unknown) => String(showDate(v) ?? '') },
            { title: 'Products', key: 'n', align: 'right' as const, render: (_: unknown, o: PromoOffer) => o.codes.length },
            { title: 'Checked', dataIndex: 'checked', key: 'ck' },
          ]} />
      </div>
      {draft && <OfferEditor key={draft.index ?? 'new'} payload={p} draft={draft} onClose={() => setDraft(null)} />}
      <Modal open={history} onCancel={() => setHistory(false)} footer={null} title="Edit history" width={720}>
        <Table size="small" rowKey={(_, i) => String(i)} dataSource={p.history} pagination={{ pageSize: 20, hideOnSinglePage: true }}
          columns={[{ title: 'Title', dataIndex: 'n' }, { title: 'Status', dataIndex: 's' }, { title: 'When', dataIndex: 'd' }, { title: 'By', dataIndex: 'u' }]} />
      </Modal>
    </>
  );
}

function OfferEditor({ payload: p, draft: start, onClose }: { payload: VanPromosPayload; draft: Draft; onClose: () => void }) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(start);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<string[]>([]);
  const [requestId, setRequestId] = useState(newId);
  const fields = LINE_FIELDS[d.type] ?? [];
  const productOptions = useMemo(() => p.products.map((x) => ({ value: x.c, label: `${x.n} - ${x.c}` })), [p.products]);
  const isNew = d.index === null;
  const locked = !isNew && !(d.type in LINE_FIELDS);

  const setLine = (i: number, patch: PromoLine) => setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const addLine = () => setD((x) => ({ ...x, lines: [...x.lines, blankLine(x.type)] }));
  const addGroups = () => {
    const first = d.lines.length ? d.lines[d.lines.length - 1] : { fq: 1, tq: 1, d: 1 };
    setD((x) => ({ ...x, lines: [...x.lines, ...groupLines(p.products, groups, Number(first.fq) || 1, Number(first.tq) || 1, Number(first.d) || 1)] }));
  };

  const save = async () => {
    if (!d.title.trim()) { setProblem('Enter Title!'); return; }
    if (!d.categories.length) { setProblem('Select Customer Category'); return; }
    if (!d.type) { setProblem('Select Offer Type!'); return; }
    for (const [i, l] of d.lines.entries()) { const m = lineProblem(d.type, l); if (m) { setProblem(`Line ${i + 1}: ${m}`); return; } }
    setSaving(true); setProblem(null);
    try {
      const res = await api.saveSetup('van_promos', {
        request_id: requestId, index: d.index, base: d.base, count: p.count, type: d.type, title: d.title, active: d.active,
        start: d.start, end: d.end, categories: d.categories, lines: d.lines,
      });
      if (!res.ok) { setProblem(res.message || 'Not saved.'); setRequestId(newId()); return; }
      void message.success(res.message || 'Updated');
      void qc.invalidateQueries({ queryKey: ['setup', 'van_promos'] });
      onClose();
    } catch (e) {
      const x = describeError(asAppError(e));
      setProblem(`${x.title}. ${x.text}`); setRequestId(newId());
      report(e);
    } finally { setSaving(false); }
  };

  const cell = (f: (typeof fields)[number], line: PromoLine, i: number) => {
    const v = line[f.key];
    if (f.kind === 'products') return <Select mode="multiple" showSearch optionFilterProp="label" style={{ minWidth: 280 }} maxTagCount="responsive"
      value={(v as string[]) ?? []} options={productOptions} onChange={(c) => setLine(i, { [f.key]: c })} disabled={locked} />;
    if (f.kind === 'product') return <Select showSearch optionFilterProp="label" style={{ minWidth: 240 }} value={(v as string) || undefined}
      placeholder={f.label} options={productOptions} onChange={(c) => setLine(i, { [f.key]: c })} disabled={locked} />;
    if (f.kind === 'uom') return <Select style={{ width: 90 }} value={v as string} options={p.uoms.map((u) => ({ value: u, label: u }))}
      onChange={(u) => setLine(i, { [f.key]: u })} disabled={locked} />;
    return <InputNumber min={0} style={{ width: 100 }} value={Number(v ?? 0)} onChange={(n) => setLine(i, { [f.key]: n ?? 0 })} disabled={locked} />;
  };

  return (
    <Drawer open onClose={onClose} size={Math.min(1180, window.innerWidth)} title={isNew ? 'New offer' : `Edit offer: ${start.title}`}
      footer={<Space style={{ float: 'right' }}><Button onClick={onClose}>Cancel</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={locked} onClick={() => void save()}>Save</Button></Space>}>
      {locked && <Alert type="info" showIcon style={{ marginBottom: 12 }} title="This offer type can only be changed in the classic window." />}
      <div className="filters" style={{ flexWrap: 'wrap' }}>
        <Input placeholder="Title" style={{ width: 280 }} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} disabled={locked} />
        <Select placeholder="Offer type" style={{ width: 260 }} value={d.type || undefined} disabled={!isNew}
          options={(isNew ? p.types : [d.type]).map((t) => ({ value: t, label: t }))} onChange={(t) => setD({ ...d, type: t, lines: [] })} />
        <DatePicker format={DATE_FMT} allowClear={false} value={dayjs(d.start)} onChange={(v) => v && setD({ ...d, start: v.format('YYYY-MM-DD') })} disabled={locked} />
        <DatePicker format={DATE_FMT} allowClear={false} value={dayjs(d.end)} onChange={(v) => v && setD({ ...d, end: v.format('YYYY-MM-DD') })} disabled={locked} />
        <span><Switch checked={d.active} onChange={(a) => setD({ ...d, active: a })} disabled={locked} /> {d.active ? 'Active' : 'Expired'}</span>
        <Select mode="multiple" placeholder="Customer category" style={{ minWidth: 280 }} value={d.categories} disabled={locked}
          options={['ALL', ...p.categories].map((c) => ({ value: c, label: c }))} onChange={(c) => setD({ ...d, categories: c })} />
      </div>
      {problem && <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problem} />}
      {d.type && (
        <>
          <Table size="small" rowKey={(_, i) => String(i)} pagination={false} dataSource={d.lines} scroll={{ x: 'max-content' }}
            locale={{ emptyText: 'No lines yet' }}
            columns={[
              ...fields.map((f) => ({ title: f.label, key: f.key, render: (_: unknown, l: PromoLine, i: number) => cell(f, l, i) })),
              { title: '', key: 'x', width: 48, render: (_: unknown, __: PromoLine, i: number) => (
                <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove line" disabled={locked}
                  onClick={() => setD((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))} />) },
            ]} />
          {!locked && (
            <div className="filters" style={{ marginTop: 12 }}>
              <Button icon={<PlusOutlined />} onClick={addLine}>Add line</Button>
              {d.type === 'Item Slabs Discount' && (
                <>
                  <Select mode="multiple" placeholder="Product groups" style={{ minWidth: 240 }} value={groups} onChange={setGroups}
                    options={p.groups.map((g) => ({ value: g, label: g }))} />
                  <Button disabled={!groups.length} onClick={addGroups}>Add every product of these groups</Button>
                </>
              )}
              <span className="muted">{d.lines.length} line(s)</span>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
