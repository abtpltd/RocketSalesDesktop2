import { useMemo, useState } from 'react';
import { Checkbox, Input, Table, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useDrill } from '../drill';
import { personTarget } from './drillMap';
import type { KasTable } from './kas';
import ExportButton from '../ui/ExportButton';
import { fileName } from '../ui/excel';
import { FullView, MaximiseButton, ShareBar } from './DashParts';

const pct = (v: unknown) => { const m = /^(-?\d+(?:\.\d+)?)%$/.exec(String(v ?? '')); return m ? Number(m[1]) : null; };
const num = (v: unknown) => (typeof v === 'number' ? v : pct(v) ?? (Number.isFinite(Number(v)) && v !== '' ? Number(v) : null));
/** Coverage colour: 80% and over good, 50% and over fair, under 50% low. */
const band = (p: number) => (p >= 80 ? 'good' : p >= 50 ? 'fair' : 'low');
const title = (t: string) => t.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/\bKpi\b/, 'KPI');

/** A KAS KPI table (Sales Pharma, Sales Lab, Engineer) in the theme's colours: sortable, exportable, can be maximised. */
export default function KpiTable({ t, month }: { t: KasTable; month: string }) {
  const [big, setBig] = useState(false);
  const [find, setFind] = useState('');
  const [missOnly, setMissOnly] = useState(false);
  const { drill } = useDrill();
  const name = title(t.title);
  const missKeys = useMemo(() => (t.columns ?? []).filter((c) => /Miss$/.test(c.key)).map((c) => c.key), [t]);
  const rows = useMemo(() => (t.rows ?? []).filter((r) => {
    if (find && !String(r.mr ?? '').toLowerCase().includes(find.trim().toLowerCase())) return false;
    return !missOnly || missKeys.some((k) => Number(r[k]) > 0);
  }), [t, find, missOnly, missKeys]);
  const columns = useMemo(() => t.columns.map((c) => ({
    key: c.key, dataIndex: c.key,
    title: c.hint ? <Tooltip title={c.hint}><span>{c.title} <InfoCircleOutlined className="kpi-hint" /></span></Tooltip> : c.title,
    align: c.key === 'mr' ? undefined : ('center' as const),
    fixed: c.key === 'mr' ? ('left' as const) : undefined,
    width: c.key === 'sr' ? 56 : undefined,
    sorter: (a: Record<string, unknown>, b: Record<string, unknown>) => {
      const x = num(a[c.key]); const y = num(b[c.key]);
      return x != null && y != null ? x - y : String(a[c.key] ?? '').localeCompare(String(b[c.key] ?? ''));
    },
    render: (v: unknown) => {
      if (c.key === 'sr') return <span className="kpi-sr">{String(v)}</span>;
      if (c.key === 'mr') {
        const to = personTarget(String(v ?? ''), month);
        return to ? <Tooltip title="Open this person's visits for the month"><a className="kpi-mr" onClick={() => drill(to)}>{String(v)}</a></Tooltip> : <span className="kpi-mr">{String(v ?? '')}</span>;
      }
      const p = pct(v);
      if (p != null) return <span className={`kpi-pill ${band(p)}`}>{String(v)}</span>;
      if (/Miss$/.test(c.key) && Number(v) > 0) return <span className="kpi-miss">{String(v)}</span>;
      return <span className="kpi-num">{typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? '')}</span>;
    },
  })), [t, month, drill]);
  const table = (scrollY?: string) => (
    <Table size="small" className="kpi-table" pagination={false} rowKey="key" dataSource={rows} columns={columns}
      scroll={{ x: 'max-content', y: scrollY }} locale={{ emptyText: find || missOnly ? 'Nobody matches the filter' : 'Nobody in this group' }} />
  );
  const exportBtn = (
    <ExportButton name={fileName(name, month)} sheet={name} disabled={!t.rows.length}
      load={async () => ({ columns: t.columns.map((c) => ({ key: c.key, title: c.title })), rows: t.rows })} />
  );
  const filters = (
    <span className="kpi-filters">
      <Input.Search allowClear size="small" placeholder="Find a person" style={{ width: 180 }} value={find} onChange={(e) => setFind(e.target.value)} />
      {missKeys.length > 0 && <Checkbox checked={missOnly} onChange={(e) => setMissOnly(e.target.checked)}>Only with misses</Checkbox>}
    </span>
  );
  const asTable = () => ({ columns: t.columns.map((c) => c.title), rows: rows.map((r) => t.columns.map((c) => (typeof r[c.key] === 'number' ? r[c.key] as number : String(r[c.key] ?? '')))) });
  return (
    <section className="kpi-card">
      <header>
        <div><h3>{name}</h3><div className="dash-sub">{rows.length === t.rows.length ? '' : `${rows.length} of `}{t.rows.length} {t.rows.length === 1 ? 'person' : 'people'}, {month}</div></div>
        <div className="kpi-actions">{filters}{exportBtn}<MaximiseButton onClick={() => setBig(true)} /></div>
      </header>
      {table()}
      {big && <FullView open={big} onClose={() => setBig(false)} title={name} sub={`${t.rows.length} people, ${month}`} extra={<>{filters}<ShareBar title={`${name}, ${month}`} table={asTable} />{exportBtn}</>}>{table('calc(100vh - 230px)')}</FullView>}
    </section>
  );
}
