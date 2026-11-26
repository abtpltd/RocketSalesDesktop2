import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Modal, Select, Table, Tag } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { SparePart, SparePartsPayload } from '../../api/types';
import ExportButton from '../../ui/ExportButton';
import { fileName } from '../../ui/excel';
import { Panel } from '../../ui/parts';
import { readTable } from '../../tools/fileRows';
import SetupFrame from '../admin/SetupFrame';
import { useSetup } from '../admin/useSetup';
import { partsFromTable } from './spareMath';
import { GridSettings, useGridPrefs } from '../../ui/GridPrefs';

type Props = { classicPath: string; openClassic: (p: string) => void };

/** Spare Parts: the spare parts of each piece of equipment, and adding more from an Excel or CSV file. */
export default function SparePartsPage({ classicPath, openClassic }: Props) {
  const { q, save, busy } = useSetup<SparePartsPayload>('spare_parts');
  return (
    <SetupFrame q={q} title="Spare Parts" meta="Parts the service app offers for each equipment" classicPath={classicPath} openClassic={openClassic}>
      {(d) => <Parts d={d} save={save} busy={busy} />}
    </SetupFrame>
  );
}

function Parts({ d, save, busy }: { d: SparePartsPayload; save: ReturnType<typeof useSetup<SparePartsPayload>>['save']; busy: string | null }) {
  const [find, setFind] = useState('');
  const [equip, setEquip] = useState<string | undefined>();
  const [upload, setUpload] = useState<{ file: string; rows: SparePart[]; problems: string[]; known: number } | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const prefs = useGridPrefs('setup:spare_parts');
  const names = useMemo(() => new Map(d.equipments.map((e) => [e.code, e.name])), [d.equipments]);
  const rows = d.parts.filter((p) => (!equip || p.c === equip) && (!find || `${p.c} ${p.pc} ${p.pn} ${names.get(p.c) ?? ''}`.toLowerCase().includes(find.toLowerCase())));
  const used = useMemo(() => [...new Set(d.parts.map((p) => p.c))].sort(), [d.parts]);

  const chosen = async (file?: File) => {
    if (!file) return;
    try {
      const { rows: found, problems } = partsFromTable(await readTable(file));
      const have = new Set(d.parts.map((p) => `${p.c}|${p.pc}`));
      setUpload({ file: file.name, rows: found, problems, known: found.filter((r) => have.has(`${r.c}|${r.pc}`)).length });
    } catch (e) {
      setUpload({ file: file.name, rows: [], problems: [e instanceof Error ? e.message : 'The file could not be read.'], known: 0 });
    }
  };
  const send = async () => {
    if (!upload) return;
    const r = await save('upload', { rows: upload.rows });
    if (r?.ok) setUpload(null);
  };
  const columns = [
    { title: 'Product code', dataIndex: 'c', key: 'c', width: 140, sorter: (a: SparePart, b: SparePart) => a.c.localeCompare(b.c), defaultSortOrder: 'ascend' as const },
    { title: 'Equipment', key: 'equip', render: (_: unknown, p: SparePart) => names.get(p.c) ?? <span className="muted">Not in equipment list</span> },
    { title: 'Part code', dataIndex: 'pc', key: 'pc', width: 160, sorter: (a: SparePart, b: SparePart) => a.pc.localeCompare(b.pc) },
    { title: 'Part name', dataIndex: 'pn', key: 'pn', sorter: (a: SparePart, b: SparePart) => a.pn.localeCompare(b.pn) },
    { title: 'UOM', dataIndex: 'uom', key: 'uom', width: 90 },
    { title: 'Price', dataIndex: 'pr', key: 'pr', width: 110, align: 'right' as const,
      sorter: (a: SparePart, b: SparePart) => Number(a.pr || 0) - Number(b.pr || 0), render: (v: number | string) => (v === '' ? '' : Number(v).toLocaleString()) },
  ];
  return (
    <>
      <Panel flush title={`${d.parts.length.toLocaleString()} spare parts`} sub={`For ${used.length} equipment codes`}
        extra={<div className="admin-row tight">
          <Select allowClear showSearch placeholder="All equipment" style={{ width: 240 }} value={equip} onChange={setEquip} optionFilterProp="label"
            options={used.map((c) => ({ value: c, label: names.get(c) ? `${names.get(c)} (${c})` : c }))} />
          <Input.Search allowClear placeholder="Find a part" style={{ width: 220 }} value={find} onChange={(e) => setFind(e.target.value)} />
          <ExportButton name={fileName('Spare Parts')} sheet="Spare Parts" disabled={!rows.length}
            load={async () => ({ columns: [{ key: 'c', title: 'PRODUCTCODE' }, { key: 'pc', title: 'PARTCODE' }, { key: 'pn', title: 'PART NAME' }, { key: 'uom', title: 'UOM' }, { key: 'pr', title: 'PRICE' }], rows: rows as unknown as Record<string, unknown>[] })} />
          <input ref={pick} type="file" accept=".xlsx,.csv" hidden onChange={(e) => { void chosen(e.target.files?.[0]); e.target.value = ''; }} />
          <Button type="primary" icon={<UploadOutlined />} onClick={() => pick.current?.click()}>Add from file</Button>
          <GridSettings columns={columns.map((c) => ({ key: c.key, title: c.title }))} prefs={prefs} />
        </div>}>
        <Table<SparePart> rowKey={(p) => `${p.c}|${p.pc}|${p.pn}|${p.uom}|${p.pr}`} size={prefs.pref.size} dataSource={rows} columns={prefs.visible(columns)}
          pagination={{ pageSize: 50, showSizeChanger: false }} locale={{ emptyText: <Empty description="No spare parts" /> }} />
      </Panel>
      <Modal open={!!upload} title={`Add spare parts from ${upload?.file ?? ''}`} onCancel={() => setUpload(null)} width={760}
        okText={`Add ${Math.max(0, (upload?.rows.length ?? 0) - (upload?.known ?? 0))} parts`} okButtonProps={{ disabled: !upload?.rows.length || upload.rows.length === upload.known, loading: busy === 'upload' }}
        onOk={() => void send()}>
        {upload && <>
          <p>The file needs the columns <b>PRODUCTCODE</b>, <b>PARTCODE</b>, <b>PART NAME</b>, <b>UOM</b> and <b>PRICE</b>. Parts are added to the list; nothing is removed.</p>
          {upload.problems.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="Some rows were left out"
            description={<ul style={{ margin: 0, paddingLeft: 18 }}>{upload.problems.slice(0, 12).map((p) => <li key={p}>{p}</li>)}</ul>} />}
          {upload.known > 0 && <Alert type="info" showIcon style={{ marginBottom: 12 }} title={`${upload.known} part${upload.known === 1 ? ' is' : 's are'} already in the list and will be left out.`} />}
          <Table<SparePart> size="small" rowKey={(p) => `${p.c}|${p.pc}`} dataSource={upload.rows.slice(0, 200)} pagination={false} scroll={{ y: 300 }}
            columns={[{ title: 'Product', dataIndex: 'c', width: 110 }, { title: 'Part code', dataIndex: 'pc', width: 140 }, { title: 'Part name', dataIndex: 'pn' },
              { title: 'UOM', dataIndex: 'uom', width: 70 }, { title: 'Price', dataIndex: 'pr', width: 90, align: 'right' },
              { title: '', key: 'k', width: 70, render: (_, p) => (names.has(p.c) ? null : <Tag color="orange">new code</Tag>) }]} />
          {upload.rows.length > 200 && <div className="muted" style={{ marginTop: 6 }}>Showing the first 200 of {upload.rows.length} rows.</div>}
        </>}
      </Modal>
    </>
  );
}
