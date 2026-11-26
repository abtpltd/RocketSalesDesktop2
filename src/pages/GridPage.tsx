import MoreMenu from '../ui/MoreMenu';
import { showDate } from '../ui/dates';
import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, DatePicker, Input, InputNumber, Result, Select, Table } from 'antd';
import { ReloadOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { GridName, GridParams } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import { cellValue, gridTotal, type Changes } from './gridMath';
import ExportButton from '../ui/ExportButton';
import { fileName } from '../ui/excel';
import { useCan } from '../access';
import TargetsStrip from './targets/TargetsStrip';
import { GridSettings, useGridPrefs } from '../ui/GridPrefs';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const money = (v: unknown) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? ''));

/** Editable grids: targets, itemized targets, HQ order limits, area distances, prices. Only changed cells are sent. */
export default function GridPage({ name, classicPath, openClassic }: { name: GridName; classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const canEdit = useCan('edit');
  const { message, modal } = AntApp.useApp();
  const qc = useQueryClient();
  const [params, setParams] = useState<GridParams>({});
  const [changes, setChanges] = useState<Changes>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const prefs = useGridPrefs(`edit:${name}`);
  const q = useQuery({ queryKey: ['grid', name, params], queryFn: () => api.fetchGrid(name, params), placeholderData: keepPreviousData, staleTime: 0 });
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const dirty = Object.keys(changes).length;

  const p = q.data;
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const all = p?.rows ?? [];
    return s ? all.filter((r) => Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(s))) : all;
  }, [p, search]);
  const total = useMemo(() => (name === 'itemized_targets' && p ? gridTotal(p.rows, changes) : null), [name, p, changes]);

  const setParam = (patch: GridParams) => {
    const go = () => { setChanges({}); setProblem(null); if (Object.keys(patch).length) setParams((x) => ({ ...x, ...patch })); else void q.refetch(); };
    if (!dirty) { go(); return; }
    modal.confirm({ title: 'Discard unsaved changes?', content: `${dirty} row(s) have changes that are not saved.`, okText: 'Discard', onOk: go });
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true); setProblem(null);
    try {
      const sentParams: GridParams = { ...params };
      if (p?.month) sentParams.month = p.month;
      if (name === 'itemized_targets') sentParams.base_price = p?.base_price ?? '';
      const res = await api.saveGrid(name, { params: sentParams, changes, request_id: newId() });
      if (!res.ok) { setProblem(res.message || 'Not saved.'); if (res.saved) void q.refetch(); return; }
      void message.success(res.message || 'Saved');
      setChanges({});
      void qc.invalidateQueries({ queryKey: ['grid', name] });
    } catch (e) {
      const d = describeError(asAppError(e));
      setProblem(`${d.title}. ${d.text}`);
      report(e);
    } finally { setSaving(false); }
  };

  if (q.isPending) return <StillLoading />;
  if (q.isError && !p) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  if (!p) return null;

  const achieve = name === 'targets' ? [{
    title: 'Achievement', key: '_ach', dataIndex: '_ach',
    render: (_: unknown, r: { id: string } & Record<string, unknown>) => {
      const target = Number(cellValue(r, 'amount', changes) ?? 0), done = Number(r.sales ?? 0);
      const pct = target ? Math.round(done / target * 100) : null;
      return <span className="tg-bar" style={{ minWidth: 150 }}><span className="trk"><span className={pct == null ? '' : pct >= 100 ? 'ok' : pct >= 80 ? 'w' : 'b'} style={{ width: `${Math.min(100, pct ?? 0)}%` }} /></span><b>{pct == null ? '–' : `${pct}%`}</b></span>;
    },
  }] : [];
  // desktop name for the web's "Update price and discount" page
  const title = name === 'price_discount' ? 'Master Pricelist' : p.title;
  const columns = p.columns.map((c) => ({
    title: c.title, dataIndex: c.key, key: c.key, align: c.kind === 'text' || c.kind === 'select' ? undefined : ('right' as const),
    sorter: c.kind === 'text' ? (a: Record<string, unknown>, b: Record<string, unknown>) => String(a[c.key] ?? '').localeCompare(String(b[c.key] ?? ''))
      : (a: Record<string, unknown>, b: Record<string, unknown>) => Number(a[c.key] ?? 0) - Number(b[c.key] ?? 0),
    render: (_: unknown, r: { id: string } & Record<string, unknown>) => {
      const v = cellValue(r, c.key, changes);
      if (!c.edit) return c.kind === 'text' ? String(showDate(v) ?? '') : money(v);
      const changed = changes[r.id] && c.key in changes[r.id];
      const put = (value: number | string) => setChanges((ch) => {
        const row = { ...(ch[r.id] ?? {}) };
        if (value === (r[c.key] ?? (c.kind === 'select' ? '' : 0))) delete row[c.key]; else row[c.key] = value;
        const next = { ...ch };
        if (Object.keys(row).length) next[r.id] = row; else delete next[r.id];
        return next;
      });
      if (c.kind === 'select') {
        return <Select size="small" style={{ width: 140 }} value={String(v ?? '') || undefined} placeholder="Choose" status={changed ? 'warning' : undefined}
          options={(c.options ?? []).map((o) => ({ value: o, label: o }))} onChange={(o) => put(o)} aria-label={`${c.title} for ${r.id}`} />;
      }
      return (
        <InputNumber size="small" min={0} precision={c.kind === 'int' ? 0 : undefined} value={Number(v ?? 0)} style={{ width: 130 }}
          status={changed ? 'warning' : undefined} aria-label={`${c.title} for ${r.id}`}
          onChange={(n) => put(n == null ? 0 : Number(n))} />
      );
    },
  }));

  return (
    <div className={name === 'targets' || name === 'itemized_targets' ? 'game' : undefined}>
      <div className="page-title">
        <h2>{title}</h2>
        <span className="muted">{p.rows.length.toLocaleString()} rows</span>
        {total != null && <span className="muted">Target value {money(total)}</span>}
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => setParam({})}>Refresh</Button>
        <ExportButton name={fileName(title, p.month, p.rep || p.supplier)} sheet={title} disabled={!p.rows.length}
          load={async () => ({ columns: p.columns.map((c) => ({ key: c.key, title: c.title })),
            rows: rows.map((r) => Object.fromEntries(p.columns.map((c) => [c.key, cellValue(r, c.key, changes)]))) })} />
        <GridSettings columns={[...p.columns.map((c) => ({ key: c.key, title: c.title })), ...achieve.map((c) => ({ key: c.key, title: c.title }))]} prefs={prefs} />
        <MoreMenu items={[{ key: 'classic', label: 'Open in classic window', onClick: () => openClassic(classicPath) }]} />
      </div>
      {p.note && <p className="muted" style={{ marginTop: -6 }}>{p.note}</p>}
      {(name === 'targets' || (name === 'itemized_targets' && p.rep)) && (
        <TargetsStrip name={name} payload={p} changes={changes} setChanges={setChanges} canEdit={canEdit} />
      )}
      <div className="filters">
        {p.month !== undefined && (
          <DatePicker picker="month" allowClear={false} value={dayjs(`${p.month}-01`)}
            onChange={(v) => { if (v) setParam({ month: v.format('YYYY-MM') }); }} />
        )}
        {p.reps && (
          <Select showSearch placeholder="Select sales person" style={{ minWidth: 240 }} value={p.rep || undefined}
            options={p.reps.map((r) => ({ value: r, label: r }))} onChange={(v) => setParam({ rep: v, base_price: undefined })} />
        )}
        {p.base_price_lists && p.rep && (
          <Select allowClear placeholder="Base price list (product price)" style={{ minWidth: 220 }} value={p.base_price || undefined}
            options={p.base_price_lists.map((r) => ({ value: r, label: r }))} onChange={(v) => setParam({ base_price: v ?? '' })} />
        )}
        {p.suppliers && (
          <Select showSearch placeholder="Select supplier" style={{ minWidth: 240 }} value={p.supplier || undefined}
            options={p.suppliers.map((s) => ({ value: s, label: s }))} onChange={(v) => setParam({ supplier: v })} />
        )}
        <Input.Search allowClear placeholder="Search" style={{ maxWidth: 260 }} onChange={(e) => setSearch(e.target.value)} />
        <span className="spacer" />
        {dirty > 0 && <span className="muted">{dirty} row(s) changed</span>}
        <Button icon={<UndoOutlined />} disabled={!dirty || saving} onClick={() => { setChanges({}); setProblem(null); }}>Discard</Button>
        {canEdit && <Button type="primary" icon={<SaveOutlined />} disabled={!dirty} loading={saving} onClick={() => void save()}>Save</Button>}
      </div>
      {problem && <Alert type="error" showIcon closable style={{ marginBottom: 12 }} title={problem} onClose={() => setProblem(null)} />}
      {p.reps && !p.rep && <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Select a sales person to see the products." />}
      {p.suppliers && !p.supplier && <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Select a supplier to see its products." />}
      <div className="panel flush">
        <Table size={prefs.pref.size} rowKey="id" columns={prefs.visible([...columns, ...achieve])} dataSource={rows} loading={q.isFetching} scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }} />
      </div>
    </div>
  );
}
