import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App as AntApp, Button, Empty, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Table, Tag, Tooltip } from 'antd';
import type { ColumnType } from 'antd/es/table';
import { CheckOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { PriceLine, PriceListsPayload } from '../api/types';
import ExportButton from '../ui/ExportButton';
import { fileName } from '../ui/excel';
import RecordForm from '../ui/RecordForm';
import { readTable } from '../tools/fileRows';
import { useCan } from '../access';
import SetupFrame from './admin/SetupFrame';
import { useSetup } from './admin/useSetup';
import { priceRows } from './priceMath';
import { GridSettings, useGridPrefs } from '../ui/GridPrefs';
import { readJson, writeJson } from '../ui/prefsMath';

const LAST_LIST = 'rs:price-list';

type Props = { classicPath: string; openClassic: (p: string) => void };

/** Price Lists (the web's Base Pricing): every price list, and the products and rates in the one chosen. Add, change, remove, upload, download. */
export default function PriceListsPage({ classicPath, openClassic }: Props) {
  const { q, save, busy } = useSetup<PriceListsPayload>('price_lists');
  const [creating, setCreating] = useState(false);
  const canCreate = useCan('create');
  return (
    <SetupFrame q={q} title="Price Lists" meta="Price lists and the rate of each product in them" classicPath={classicPath} openClassic={openClassic}
      actions={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>New price list</Button> : undefined}>
      {(d) => <>
        <Lists d={d} save={save} busy={busy} />
        <RecordForm name="base_pricing" recordKey={null} open={creating} onClose={() => { setCreating(false); void q.refetch(); }} />
      </>}
    </SetupFrame>
  );
}

function Lists({ d, save, busy }: { d: PriceListsPayload; save: ReturnType<typeof useSetup<PriceListsPayload>>['save']; busy: string | null }) {
  const { message } = AntApp.useApp();
  const { modal } = AntApp.useApp();
  const [sel, setSelRaw] = useState<string>(() => {
    const last = readJson<string>(LAST_LIST, '', (v) => typeof v === 'string');
    return d.lists.some((l) => l.name === last) ? last : d.lists[0]?.name ?? '';
  });
  // opens in view mode; Edit shows rate boxes, add, upload and remove (only for roles that may change price lists)
  const [mode, setModeRaw] = useState<'view' | 'edit'>('view');
  const [find, setFind] = useState('');
  const prefs = useGridPrefs('setup:price_lists');
  const [edits, setEdits] = useState<Record<string, number | null>>({});
  const [adding, setAdding] = useState<{ code?: string; rate?: number | null }>({});
  const [upload, setUpload] = useState<{ file: string; rows: { code: string; rate: number | string }[]; problems: string[] } | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const canCreate = useCan('create');
  const canEdit = useCan('edit');
  const canDelete = useCan('delete');
  const mayEdit = canCreate || canEdit || canDelete;
  const editing = mode === 'edit' && mayEdit;
  useEffect(() => { if (!d.lists.some((l) => l.name === sel)) setSelRaw(d.lists[0]?.name ?? ''); }, [d.lists, sel]);
  useEffect(() => setEdits({}), [sel, d]);

  const list = d.lists.find((l) => l.name === sel);
  const products = useMemo(() => new Map(d.products.map((p) => [p.code, p])), [d.products]);
  const inList = useMemo(() => new Set(list?.lines.map((l) => l.code) ?? []), [list]);
  const lines = (list?.lines ?? []).filter((l) => !find || `${l.code} ${l.name}`.toLowerCase().includes(find.toLowerCase()));
  const changed = Object.entries(edits).filter(([k, v]) => v != null && list?.lines.find((l) => l.key === k)?.rate !== v);
  // leaving a list or edit mode with unsaved rates asks first
  const guard = (go: () => void) => {
    if (!changed.length) { go(); return; }
    modal.confirm({ title: `${changed.length} changed rate${changed.length === 1 ? '' : 's'} not saved`, content: 'Leave without saving them?',
      okText: 'Leave without saving', okButtonProps: { danger: true }, cancelText: 'Stay', onOk: () => { setEdits({}); go(); } });
  };
  const setSel = (name: string) => guard(() => { setSelRaw(name); writeJson(LAST_LIST, name); setAdding({}); });
  const setMode = (m: 'view' | 'edit') => (m === 'view' ? guard(() => setModeRaw('view')) : setModeRaw('edit'));

  const saveRates = async () => {
    for (const [i, [key, rate]] of changed.entries()) {
      const l = list!.lines.find((x) => x.key === key)!;
      const r = await save('rate', { list: sel, code: l.code, key, rate }, { reload: i === changed.length - 1 });
      if (!r?.ok) return;
    }
    setEdits({});
  };
  const chosen = async (file?: File) => {
    if (!file) return;
    try { setUpload({ file: file.name, ...priceRows(await readTable(file)) }); }
    catch (e) { void message.error(e instanceof Error ? e.message : 'The file could not be read.'); }
  };

  return (
    <div className="pl-main">
      {!d.lists.length ? <Empty description="No price lists yet" /> : <>
          <div className="pl-head">
            <Select showSearch aria-label="Price list" style={{ minWidth: 260 }} value={sel || undefined} optionFilterProp="label" onChange={(v: string) => setSel(v)}
              options={d.lists.map((l) => ({ value: l.name, label: l.name, count: l.count }))}
              optionRender={(o) => <span className="pl-opt"><b>{o.label}</b><small>{(o.data as { count: number }).count} products</small></span>} />
            {list && <Tag bordered={false}>{list.count} products</Tag>}
            {mayEdit && (
              <Segmented value={editing ? 'edit' : 'view'} onChange={(v) => setMode(v as 'view' | 'edit')}
                options={[{ value: 'view', label: 'View', icon: <EyeOutlined /> }, { value: 'edit', label: 'Edit', icon: <EditOutlined /> }]} />
            )}
            <span className="grow" />
            <Input.Search allowClear placeholder="Find a product" style={{ width: 220 }} value={find} onChange={(e) => setFind(e.target.value)} />
            <GridSettings columns={[{ key: 'code', title: 'Code' }, { key: 'name', title: 'Product' }, { key: 'mrp', title: 'MRP' }, { key: 'rate', title: 'Rate' }, { key: 'tax', title: 'With tax' }]} prefs={prefs} />
            {list && <ExportButton name={fileName(`Price list ${list.name}`)} sheet={list.name} disabled={!list.count}
              load={async () => ({ columns: [{ key: 'code', title: 'PRODUCT CODE' }, { key: 'name', title: 'PRODUCT NAME' }, { key: 'group', title: 'GROUP' },
                { key: 'rate', title: 'AMOUNT' }, { key: 'with_tax', title: 'PRICE WITH TAX' }],
                rows: list.lines.map((l) => { const p = products.get(l.code); return { ...l, group: p?.group ?? '', with_tax: p ? Math.round(l.rate * (1 + p.tax / 100) * 100) / 100 : '' }; }) })} />}
            {editing && canCreate && <>
              <input ref={pick} type="file" accept=".xlsx,.csv" hidden onChange={(e) => { void chosen(e.target.files?.[0]); e.target.value = ''; }} />
              <Tooltip title="Excel or CSV with PRODUCT CODE and AMOUNT columns, like the download"><Button icon={<UploadOutlined />} onClick={() => pick.current?.click()}>Upload</Button></Tooltip>
            </>}
          </div>
        {list ? <>
          {editing && canCreate && (
            <div className="pl-add">
              <Select showSearch placeholder="Add a product to this list" style={{ flex: 1, minWidth: 260 }} value={adding.code} optionFilterProp="label"
                onChange={(c: string) => setAdding({ code: c, rate: products.get(c)?.mrp ?? null })}
                options={d.products.filter((p) => !inList.has(p.code)).map((p) => ({ value: p.code, label: `${p.name} (${p.code})` }))} />
              <InputNumber min={0} placeholder="Rate" value={adding.rate ?? null} onChange={(v) => setAdding({ ...adding, rate: v })} style={{ width: 140 }} />
              <Button type="primary" icon={<PlusOutlined />} disabled={!adding.code || adding.rate == null} loading={busy === 'add'}
                onClick={() => void save('add', { list: sel, code: adding.code, rate: adding.rate }).then((r) => r?.ok && setAdding({}))}>Add</Button>
            </div>
          )}
          {changed.length > 0 && (
            <Alert type="warning" showIcon style={{ margin: '10px 0' }} title={`${changed.length} rate${changed.length === 1 ? '' : 's'} changed, not saved`}
              action={<><Button size="small" onClick={() => setEdits({})}>Discard</Button> <Button size="small" type="primary" icon={<CheckOutlined />} loading={busy === 'rate'} onClick={() => void saveRates()}>Save rates</Button></>} />
          )}
          <Table<PriceLine> rowKey="key" dataSource={lines} pagination={{ pageSize: 50, showSizeChanger: false }}
            locale={{ emptyText: <Empty description="No products in this list yet" /> }}
            size={prefs.pref.size}
            columns={[...prefs.visible<ColumnType<PriceLine>>([
              { title: 'Code', dataIndex: 'code', key: 'code', width: 130, sorter: (a, b) => a.code.localeCompare(b.code) },
              { title: 'Product', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name), defaultSortOrder: 'ascend' },
              { title: 'MRP', key: 'mrp', width: 110, align: 'right', render: (_, l) => products.get(l.code)?.mrp?.toLocaleString() ?? '' },
              { title: 'Rate', dataIndex: 'rate', key: 'rate', width: 160, align: 'right', sorter: (a, b) => a.rate - b.rate,
                render: (v: number, l) => (editing && canEdit ? (
                  <InputNumber min={0} size="small" value={edits[l.key] ?? v} onChange={(n) => setEdits({ ...edits, [l.key]: n })}
                    className={edits[l.key] != null && edits[l.key] !== v ? 'pl-changed' : ''} style={{ width: 120 }} />
                ) : v.toLocaleString()) },
              { title: 'With tax', key: 'tax', width: 110, align: 'right', render: (_, l) => { const p = products.get(l.code); return p ? (Math.round((edits[l.key] ?? l.rate) * (1 + p.tax / 100) * 100) / 100).toLocaleString() : ''; } },
            ]),
              ...(editing && canDelete ? [{ title: '', key: 'del', width: 56, render: (_: unknown, l: PriceLine) => (
                <Popconfirm title={`Remove ${l.name} from ${sel}?`} description="Customers on this list then get the product's normal price." okText="Remove" okButtonProps={{ danger: true }}
                  onConfirm={() => void save('delete', { list: sel, code: l.code, key: l.key })}>
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${l.name}`} />
                </Popconfirm>) }] : []),
            ]} />
        </> : <Empty description="Choose a price list" />}
      </>}
      <Modal open={!!upload} title={`Upload into ${sel}`} width={720} onCancel={() => setUpload(null)} okText={`Save ${upload?.rows.length ?? 0} rates`}
        okButtonProps={{ disabled: !upload?.rows.length, loading: busy === 'upload' }}
        onOk={() => void save('upload', { list: sel, rows: upload!.rows }).then((r) => {
          if (r?.ok) setUpload(null);
          const probs = (r as { problems?: string[] } | null)?.problems;
          if (probs?.length) Modal.info({ title: 'Some rows were left out', content: <ul>{probs.slice(0, 20).map((p) => <li key={p}>{p}</li>)}</ul> });
        })}>
        {upload && <>
          <p>From <b>{upload.file}</b>: products already in the list get the new rate, new products are added. Nothing is removed.</p>
          {upload.problems.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 10 }} title="Some rows were left out"
            description={<ul style={{ margin: 0, paddingLeft: 18 }}>{upload.problems.slice(0, 10).map((p) => <li key={p}>{p}</li>)}</ul>} />}
          <Table size="small" rowKey="code" pagination={false} scroll={{ y: 300 }} dataSource={upload.rows.slice(0, 300)}
            columns={[{ title: 'Code', dataIndex: 'code', width: 130 }, { title: 'Product', key: 'n', render: (_, r) => products.get(r.code)?.name ?? <Tag color="red">not a product</Tag> },
              { title: 'Now', key: 'now', width: 100, align: 'right', render: (_, r) => list?.lines.find((l) => l.code === r.code)?.rate ?? <Tag color="green">new</Tag> },
              { title: 'New rate', dataIndex: 'rate', width: 100, align: 'right' }]} />
        </>}
      </Modal>
    </div>
  );
}
