import { useRowKeys } from '../ui/useRowKeys';
import { GridSettings, SavedViews, useGridPrefs, useOwnerKey } from '../ui/GridPrefs';
import { readJson, writeJson } from '../ui/prefsMath';
import RowColours from '../ui/RowColours';
import { useCompanyTone } from '../assistant/useAssistant';
import { TONE_DEFAULT, TONE_REPORTS, attendancePct, batteryPct, batteryTone, clockText, toneFor, type ToneConfig } from '../ui/rowTone';
import MoreMenu from '../ui/MoreMenu';
import { DrillBanner, drillRange, useDrillIn } from '../drill';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, DatePicker, Input, Result, Select, Table } from 'antd';
import { ExportOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { describeError, syncedAgo } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import ActionBar from '../ui/ActionBar';
import OrderDetails from './OrderDetails';
import StockDocEditor from '../ui/StockDocEditor';
import RecordPanel from '../ui/RecordPanel';
import Profile360 from './Profile360';
import StockRequestDrawer from '../ui/StockRequestDrawer';
import ExportButton from '../ui/ExportButton';
import GridFilters from '../ui/GridFilters';
import { showDate } from '../ui/dates';
import { fileName } from '../ui/excel';
import type { RecordAction, StockDocKind, TableReportName } from '../api/types';

const STOCK_DOC: Partial<Record<string, [StockDocKind, string]>> = {
  gift_stock: ['gift_stock_in', 'Stock IN'], sample_stock: ['sample_stock_in', 'Stock IN'],
  gift_allocations: ['gift_allocation', 'New allocation'], sample_allocations: ['sample_allocation', 'New allocation'],
};

export type ReportName = TableReportName;
/** Reports where the sales person is picked from a list (required for the call report, optional for the rest). */
const PICKS_REP = new Set<ReportName>(['dcr', 'detailing', 'sampling', 'gifts', 'target_vs_sales', 'target_itemized', 'doctor_meetings', 'daily_notes', 'feedback', 'bank_deposit', 'expiry', 'geocode_changes', 'doctor_geocode_changes', 'prescription_audit', 'route_planning', 'prospects', 'leaves', 'gift_stock', 'sample_stock', 'customer_coverage', 'monthly_visit_summary', 'survey', 'service_calls', 'availability', 'meetings', 'competitor_stock', 'supply_performance', 'item_sales_analysis', 'item_sales_matrix', 'customer_sales_analysis', 'salesmen_sales_analysis', 'salesmen_sales_summary', 'salesmen_supplier_summary', 'rocket_form_report', 'go_green']);
const SIZE = 100;
/** Reports for one month, not a date range. */
/** Reports that are not about a period at all. */
const NO_DATES = new Set<ReportName>(['customer_ageing', 'mobile_customers', 'mobile_doctors', 'last_activity', 'stock_requests', 'gift_stock', 'sample_stock', 'question_bank', 'daily_summary']);
const MONTHLY = new Set<ReportName>(['target_vs_sales', 'target_itemized', 'monthly_visit_summary']);
/** Reports that show nothing until a sales person is picked. */
const NEEDS_REP = new Set<ReportName>(['dcr', 'target_itemized', 'gift_stock', 'sample_stock', 'monthly_visit_summary', 'survey', 'supply_performance', 'go_green', 'customer_sales_analysis', 'salesmen_sales_analysis', 'salesmen_sales_summary']);
const SALES_GRID = new Set<ReportName>(['item_sales_analysis', 'item_sales_matrix']);
/** Reports whose picker lists depend on the view chosen (supplier, product group, sales person...). */
const PICK_FOLLOWS_KIND = new Set<ReportName>(['item_sales_analysis', 'item_sales_matrix', 'customer_sales_analysis']);
/** Reports with a view / status select: the choices and the first one. */
const KINDS: Partial<Record<ReportName, { value: string; label: string }[]>> = {
  stock_requests: [{ value: 'gift', label: 'Gift' }, { value: 'sample', label: 'Sample' }],
  customer_coverage: [{ value: 'detail', label: 'Detail' }, { value: 'reps', label: 'Sales-rep view' }],
  daily_orders: [{ value: 'approved', label: 'Approved' }, { value: 'created', label: 'Created' }],
  daily_summary: [{ value: 'summary', label: 'Summary' }, { value: 'start', label: 'Start of day' }, { value: 'end', label: 'End of day' }],
  competitor_stock: [{ value: 'visits', label: 'Visits' }, { value: 'items', label: 'Products' }],
  customer_order_analysis: [{ value: 'qty', label: 'Quantity view' }, { value: 'amount', label: 'Amount view' }],
  item_sales_analysis: [{ value: 'supplier', label: 'Supplier' }, { value: 'group', label: 'Product group' }, { value: 'salesman', label: 'Salesman' }, { value: 'customer', label: 'Customer' }, { value: 'custgroup', label: 'Customer group' }],
  item_sales_matrix: [{ value: 'supplier', label: 'Supplier' }, { value: 'group', label: 'Product group' }, { value: 'salesman', label: 'Salesman' }, { value: 'customer', label: 'Customer' }, { value: 'custgroup', label: 'Customer group' }],
  customer_sales_analysis: [{ value: 'sup_qty', label: 'Supplier – quantity' }, { value: 'sup_amt', label: 'Supplier – amount' }, { value: 'grp_qty', label: 'Product group – quantity' }, { value: 'grp_amt', label: 'Product group – amount' }, { value: 'sm_qty', label: 'Salesman – quantity' }, { value: 'sm_amt', label: 'Salesman – amount' }, { value: 'cg_qty', label: 'Customer group – quantity' }, { value: 'cg_amt', label: 'Customer group – amount' }],
  salesmen_sales_analysis: [{ value: 'qty', label: 'Quantity view' }, { value: 'amount', label: 'Amount view' }],
  salesmen_sales_summary: [{ value: 'qty', label: 'Quantity view' }, { value: 'amount', label: 'Amount view' }],
};
const PICK_LABEL: Partial<Record<ReportName, [string, string]>> = {
  supply_performance: ['Select customer (chain)', 'Select a customer to see its branches.'],
  go_green: ['Select customer (chain)', 'Select a customer to see which products each branch ordered.'],
  item_sales_analysis: ['Select (all customers when empty)', ''],
  item_sales_matrix: ['Select (all customers when empty)', ''],
  customer_sales_analysis: ['Select supplier / group / sales person', 'Choose the supplier, product group, sales person or customer group.'],
  salesmen_sales_analysis: ['Select sales person', 'Select a sales person to see the customers and products.'],
  salesmen_sales_summary: ['Select supplier', 'Select a supplier to see its products by sales person.'],
  gift_stock: ['Select store or sales rep', 'Select a store or sales rep to see the stock.'],
  sample_stock: ['Select store or sales rep', 'Select a store or sales rep to see the stock.'],
  survey: ['Select survey form', 'Select a survey form to see its answers.'],
  monthly_visit_summary: ['Select sales person', 'Select a sales person to see the month.'],
};
const RIGHT = new Set(['order', 'order_qty', 'sales', 'customer_visits', 'doctor_visits', 'productive', 'target', 'amount', 'count', 'target', 'sales', 'target_qty', 'target_value', 'sales_qty', 'sales_value', 'new_customers', 'orders', 'qty', 'customer_count', 'count']);

/** A long read-only report with a date range, search and paging (Visit Report, Attendance, Daily Call Report). */
export default function ReportTable({ name, noun, openClassic, classicPath, extra }: {
  name: ReportName; noun: string; classicPath: string; openClassic: (path: string) => void;
  /** a page's own action buttons, shown beside Refresh and Export */
  extra?: ReactNode;
}) {
  const { api, report, setOffline } = useSession();
  const drillIn = useDrillIn(classicPath);
  const drillDays = drillRange(drillIn);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(() => (drillDays ? [dayjs(drillDays[0]), dayjs(drillDays[1])] : null)); // null: today, decided by the server
  const [typed, setTyped] = useState(() => drillIn?.search ?? '');
  const [search, setSearch] = useState(() => drillIn?.search ?? '');
  const [page, setPage] = useState(1);
  const [rep, setRep] = useState('');
  const [kind, setKind] = useState(KINDS[name]?.[0].value ?? 'orders');
  const [opened, setOpened] = useState<string | null>(null);
  const [panel, setPanel] = useState<number | null>(null);
  const prefs = useGridPrefs(`report:${name}`);
  const toneKey = useOwnerKey('tone', name);
  const companyTone = useCompanyTone();
  const [ownTone, setToneState] = useState<ToneConfig | null>(() => readJson<ToneConfig | null>(toneKey, null, (v) => { const t = v as ToneConfig; return !!t && typeof t.on === 'boolean' && typeof t.lo === 'number' && typeof t.hi === 'number' && typeof t.late === 'string'; }));
  /** a person's own choice wins; otherwise the company's limits */
  const tone: ToneConfig = ownTone ?? companyTone ?? TONE_DEFAULT;
  const setTone = (t: ToneConfig) => { setToneState(t); writeJson(toneKey, t); };
  const [profile, setProfile] = useState<{ kind: 'customer' | 'doctor'; key: string } | null>(null);
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const [manager, setManager] = useState('');
  const [appUser, setAppUser] = useState('');
  const [docOpen, setDocOpen] = useState(false);
  const doc = STOCK_DOC[name];
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setTimeout(() => { setSearch(typed); setPage(1); }, 350); return () => clearTimeout(t); }, [typed]);
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000); return () => clearInterval(t); }, []);

  const from = range ? range[0].format(MONTHLY.has(name) ? 'YYYY-MM' : 'YYYY-MM-DD') : '';
  const to = range ? range[1].format('YYYY-MM-DD') : '';
  const gridQ = { sort: sort?.key, desc: sort?.desc, manager, app_user: appUser };
  const q = useQuery({
    queryKey: ['report', name, from, to, search, rep, kind, page, sort?.key, sort?.desc, manager, appUser],
    queryFn: () => api.fetchReport(name, { from, to, search, rep, kind, page, size: name === 'performance' ? 500 : SIZE, ...gridQ }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { setPanel(null); }, [page, search, from, to, rep, kind]);
  const kbRows = q.data?.data.rows ?? [];
  const opensDoc = name === 'quotations' || name === 'transfer_orders' || (name === 'stock_requests' && q.data?.source !== 'offline');
  const kb = useRowKeys(kbRows.length, (i) => { if (opensDoc) { const k = kbRows[i]?.key; if (k) setOpened(String(k)); } else setPanel(i); });
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  if (q.isPending) return <StillLoading />;
  if (q.isError && !q.data) {
    const d = describeError(asAppError(q.error));
    return (
      <Result status="warning" title={d.title} subTitle={d.text}
        extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
          <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />
    );
  }
  const { data: raw, source, saved_at } = q.data!;
  const p = name === 'attendance' ? withShare(raw) : raw;
  const columns = p.columns.map((c) => ({
    title: c.title, dataIndex: c.key, key: c.key,
    sorter: true, sortOrder: sort?.key === c.key ? (sort.desc ? 'descend' as const : 'ascend' as const) : null,
    render: (v: unknown) => showDate(v) as React.ReactNode,
    ellipsis: name !== 'dcr' && name !== 'daily_notes' && name !== 'feedback' && name !== 'route_planning',
    onCell: name === 'dcr' || name === 'daily_notes' || name === 'feedback' || name === 'route_planning' ? () => ({ style: { whiteSpace: 'pre-line' as const } })
      : name === 'go_green' && c.key.startsWith('o:')
        ? (r: Record<string, unknown>) => (r[c.key] !== '' && r[c.key] != null ? { className: 'go-green-cell' } : {})
      : name === 'performance' && c.key !== 'date'
        ? (r: Record<string, unknown>) => {
          const v = Number(r[c.key] ?? 0);
          const share = p.max ? Math.min(1, v / p.max) : 0;
          return { style: { background: `rgba(22, 119, 255, ${(share * 0.55).toFixed(2)})`, textAlign: 'right' as const } };
        }
        : undefined, align: RIGHT.has(c.key) || /^[ops]:/.test(c.key) || /^[qas]\d+$/.test(c.key) || (c.key === 'total' && (name === 'customer_order_analysis' || name === 'salesmen_sales_summary')) || (SALES_GRID.has(name) && (c.key === 'amount' || c.key === 'free')) ? ('right' as const) : undefined,
  }));
  if (TONE_REPORTS.has(name) && tone.on) {
    for (const col of columns) {
      const own = col.onCell as ((r: Record<string, unknown>) => Record<string, unknown>) | undefined;
      (col as { onCell?: unknown }).onCell = (r: Record<string, unknown>) => {
        const t = toneFor(name, r, tone).cells?.[col.key];
        const base = own ? own(r) : {};
        return t ? { ...base, className: [base.className, `tone-cell-${t}`].filter(Boolean).join(' ') } : base;
      };
    }
  }
  if (name === 'attendance') {
    for (const col of columns) {
      if (col.key !== 'start_day' && col.key !== 'end_day') continue;
      (col as { render?: unknown }).render = (v: unknown) => {
        const pct = batteryPct(v);
        if (pct == null) return v as never;
        const late = col.key === 'start_day' && toneFor(name, { start_day: v }, tone).cells?.start_day === 'bad';
        const tip = `${col.key === 'start_day' ? 'Started' : 'Ended'} ${clockText(v)}${late ? `, limit ${tone.late}` : ''}. Battery ${pct}%.`;
        return <span title={tip}>{clockText(v)} <span className={`batt batt-${batteryTone(pct)}`}>{pct}%</span></span>;
      };
    }
  }
  if (name === 'rocket_form_report') {
    columns.push({
      title: 'Print', dataIndex: 'print', key: 'print', ellipsis: false, onCell: undefined, align: undefined, sorter: false, sortOrder: null,
      render: (v: unknown) => (v ? <Button size="small" icon={<PrinterOutlined />} disabled={source === 'offline'} onClick={() => openClassic(String(v))}>Print</Button> : null),
    } as unknown as (typeof columns)[number]);
  }
  if (p.rows.some((r) => Array.isArray((r as Record<string, unknown>).actions)) && source !== 'offline') {
    columns.push({
      title: 'Actions', dataIndex: '__actions', key: '__actions', ellipsis: false, onCell: undefined, align: undefined,
      render: (_: unknown, r: Record<string, unknown>) => (
        <ActionBar size="small" actions={(r.actions as RecordAction[]) ?? []} recordKey={String(r.key)} refresh={[['report', name]]} />
      ),
    } as unknown as (typeof columns)[number]);
  }
  return (
    <>
      <div className="page-title">
        <h2>{p.title}</h2>
        <span className="muted">{p.total.toLocaleString()} {noun}</span>
        {p.summary && <span className="muted">{p.summary}</span>}
        <span className="muted">{source === 'offline' ? `Saved copy from ${syncedAgo(saved_at, now)}` : `Synced ${syncedAgo(saved_at, now)}`}</span>
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <ExportButton name={fileName(p.title, NO_DATES.has(name) ? undefined : p.from, NO_DATES.has(name) || p.to === p.from ? undefined : p.to)} sheet={p.title}
          disabled={source === 'offline' || !p.total}
          load={async () => {
            const all = (await api.fetchReport(name, { from, to, search, rep, kind, page: 1, size: SIZE, ...gridQ, export: true })).data;
            const full = name === 'attendance' ? withShare(all) : all;
            return { columns: prefs.forExport(full.columns), rows: full.rows, cut: full.export_cut };
          }} />
        {doc && source !== 'offline' && <Button size="small" type="primary" onClick={() => setDocOpen(true)}>{doc[1]}</Button>}
        {source !== 'offline' && extra}
        <MoreMenu items={[{ key: 'classic', icon: <ExportOutlined />, onClick: () => openClassic(classicPath), label: name === 'mobile_customers' || name === 'mobile_doctors' || name === 'go_green' || name === 'rocket_form_report' ? 'Open in classic window' : name === 'route_planning' ? 'Edit and visits in classic window' : name === 'bank_deposit' || name === 'payment_collection' || name === 'prescription_audit' ? 'Photos and export in classic window' : 'Map, photos and export in classic window' }]} />
      </div>
      {source === 'offline' && (
        <Alert type="warning" showIcon style={{ marginBottom: 14 }} title="You are working offline"
          description="This is the last copy saved on this computer. Dates, searches and pages you have not opened before are not available." />
      )}
      {!!p.data_from && <Alert type="info" showIcon style={{ marginBottom: 12 }} title={`Your company is allowed data from ${dayjs(p.data_from).format('DD MMM YYYY')}.`} />}
      <DrillBanner t={drillIn} onClear={() => { setRange(null); setTyped(''); setSearch(''); setPage(1); }} />
      <div className="filters">
        {NO_DATES.has(name) ? null : MONTHLY.has(name) ? (
          <DatePicker picker="month" allowClear={false} value={range ? range[0] : dayjs(p.from)}
            onChange={(v) => { if (v) setRange([v.startOf('month'), v.endOf('month')]); setPage(1); }} />
        ) : <DatePicker.RangePicker allowClear value={range ?? [dayjs(p.from), dayjs(p.to)]}
          onChange={(v) => { setRange(v && v[0] && v[1] ? [v[0], v[1]] : null); setPage(1); }} />}
        {name === 'performance' && (
          <>
            <Select value={kind} style={{ width: 120 }} onChange={(v) => { setKind(v); setPage(1); }}
              options={[{ value: 'orders', label: 'Orders' }, { value: 'visits', label: 'Visits' }, { value: 'sales', label: 'Sales' }]} />
            <Select showSearch allowClear placeholder="All managers" style={{ minWidth: 220 }} value={rep || undefined}
              options={(p.managers ?? []).map((m) => ({ value: m, label: m }))}
              onChange={(v) => { setRep(v ?? ''); setPage(1); }} />
          </>
        )}
        {KINDS[name] && (
          <Select value={kind} style={{ width: name === 'customer_sales_analysis' ? 230 : 150 }} onChange={(v) => { setKind(v); setPage(1); if (PICK_FOLLOWS_KIND.has(name) && v.split('_')[0] !== kind.split('_')[0]) setRep(''); }} options={KINDS[name]} />
        )}
        {PICKS_REP.has(name) && name !== 'performance' && (
          <Select showSearch allowClear placeholder={PICK_LABEL[name]?.[0] ?? (NEEDS_REP.has(name) ? 'Select sales person' : 'All sales people')} style={{ minWidth: 240 }} value={rep || undefined}
            optionFilterProp="label" options={(p.users ?? []).map((u) => ({ value: u.code, label: u.code === u.name ? u.name : `${u.name} (${u.code})` }))}
            onChange={(v) => { setRep(v ?? ''); setPage(1); }} />
        )}
 {p.grid?.filterable && (
          <GridFilters grid={p.grid} manager={manager} appUser={appUser} showAppUser={!PICKS_REP.has(name)}
            onChange={(m, u) => { setManager(m); setAppUser(u); setPage(1); }} />
        )}
        {name !== 'performance' && <Input.Search allowClear placeholder="Search" style={{ maxWidth: 280 }} value={typed}
          onChange={(e) => setTyped(e.target.value)} onSearch={(v) => { setSearch(v); setPage(1); }} />}
        <span className="filters-end">
          <SavedViews page={`report:${name}`} from={NO_DATES.has(name) || !range ? '' : range[0].format('YYYY-MM-DD')} to={NO_DATES.has(name) || !range ? '' : range[1].format('YYYY-MM-DD')}
            filters={{ search, rep, kind, manager, app_user: appUser }}
            onApply={(r, f) => { setRange(r ? [dayjs(r[0]), dayjs(r[1])] : null); setTyped(f.search ?? ''); setSearch(f.search ?? ''); setRep(f.rep ?? ''); if (f.kind) setKind(f.kind); setManager(f.manager ?? ''); setAppUser(f.app_user ?? ''); setPage(1); }} />
          {TONE_REPORTS.has(name) && <RowColours report={name} value={tone} onChange={setTone} fallback={companyTone} />}
          <GridSettings columns={p.columns} prefs={prefs} />
        </span>
      </div>
      {NEEDS_REP.has(name) && !rep && <Alert type="info" showIcon style={{ marginBottom: 12 }} title={PICK_LABEL[name]?.[1] ?? 'Select a sales person to see the calls.'} />}
      <div className="panel flush"><Table size={prefs.pref.size} rowKey={(r, i) => `${String(r.key)}-${i}`} columns={prefs.visible(columns)} dataSource={p.rows} loading={q.isFetching}
        scroll={{ x: 'max-content' }}
        onChange={(_pg, _f, sorter) => {
          const one = Array.isArray(sorter) ? sorter[0] : sorter;
          const key = one?.order ? String(one.columnKey ?? one.field ?? '') : '';
          setSort(key ? { key, desc: one.order === 'descend' } : null);
        }}
        rowClassName={(r, i) => [TONE_REPORTS.has(name) ? toneFor(name, r, tone).row && `tone-${toneFor(name, r, tone).row}` : '', kb.rowClass(i)].filter(Boolean).join(' ')}
        onRow={name === 'quotations' || name === 'transfer_orders' || (name === 'stock_requests' && source !== 'offline') ? (r) => ({ onClick: () => setOpened(String(r.key)), style: { cursor: 'pointer' } })
          : (r, i) => ({ onClick: (e) => { if (!(e.target as HTMLElement).closest('a, button, input, .ant-select')) setPanel(i ?? p.rows.indexOf(r)); }, style: { cursor: 'pointer' } })}
        pagination={name === 'performance' ? false : { current: p.page, pageSize: p.size, total: p.total, showSizeChanger: false, onChange: (n) => setPage(n) }} /></div>
      <RecordPanel rows={p.rows} index={panel} columns={p.columns} title={p.title} onIndex={setPanel} onClose={() => setPanel(null)}
        links={(r) => {
          const code = String(r.code ?? '').trim();
          const kind = name === 'visits' && code ? (r.type === 'C' ? 'customer' : r.type === 'D' ? 'doctor' : null) : null;
          return kind ? [{ label: kind === 'customer' ? 'Open customer 360°' : 'Open doctor 360°', onClick: () => setProfile({ kind, key: `code:${code}` }) }] : [];
        }} />
      <Profile360 kind={profile?.kind ?? 'customer'} recordKey={profile?.key ?? null} onClose={() => setProfile(null)} />
      {name === 'stock_requests' && <StockRequestDrawer requestKey={opened} onClose={() => setOpened(null)} />}
      {doc && <StockDocEditor kind={doc[0]} open={docOpen} onClose={() => setDocOpen(false)} />}
      {(name === 'quotations' || name === 'transfer_orders') && <OrderDetails kind={name === 'quotations' ? 'quotation' : 'transfer'} orderKey={opened} onClose={() => setOpened(null)} openClassic={openClassic} classicPath={classicPath} />}
    </>
  );
}

/** Attendance: adds "% of target" (customer + doctor visits against the visit target), worked out here from the rows. */
function withShare<T extends { columns: { key: string; title: string }[]; rows: Record<string, string | number | null>[] }>(p: T): T {
  if (p.columns.some((c) => c.key === 'pct')) return p;
  return {
    ...p,
    columns: [...p.columns, { key: 'pct', title: '% of Target' }],
    rows: p.rows.map((r) => { const v = attendancePct(r); return { ...r, pct: v == null ? '' : `${v}%` }; }),
  };
}
