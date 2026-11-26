import { useRowKeys } from '../ui/useRowKeys';
import { GridSettings, SavedViews, useGridPrefs } from '../ui/GridPrefs';
import MoreMenu from '../ui/MoreMenu';
import { DrillBanner, drillRange, useDrillIn } from '../drill';
import { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Input, Result, Select, Table } from 'antd';
import { ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { describeError, syncedAgo } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import OrderDetails from './OrderDetails';
import ExportButton from '../ui/ExportButton';
import GridFilters from '../ui/GridFilters';
import { showDate } from '../ui/dates';
import { fileName } from '../ui/excel';

const SIZE = 100;
const money = (v: unknown) => (typeof v === 'number' ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v ?? ''));
const MONEY_COLUMNS = new Set(['ex_vat', 'total']);

/** The Orders list: same filter as the web Orders grid (date received, status), read only. */
export default function Orders({ openClassic, classicPath }: { classicPath: string; openClassic: (path: string) => void }) {
  const { api, report, setOffline } = useSession();
  const drillIn = useDrillIn(classicPath);
  const drillDays = drillRange(drillIn);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(() => (drillDays ? [dayjs(drillDays[0]), dayjs(drillDays[1])] : null)); // null: the server's default, the current month
  const [status, setStatus] = useState('');
  const [typed, setTyped] = useState(() => drillIn?.search ?? '');
  const [search, setSearch] = useState(() => drillIn?.search ?? '');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const [manager, setManager] = useState('');
  const [appUser, setAppUser] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const prefs = useGridPrefs('orders');
  useEffect(() => { const t = setTimeout(() => { setSearch(typed); setPage(1); }, 350); return () => clearTimeout(t); }, [typed]);
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000); return () => clearInterval(t); }, []);

  const from = range ? range[0].format('YYYY-MM-DD') : '';
  const to = range ? range[1].format('YYYY-MM-DD') : '';
  const gridQ = { sort: sort?.key, desc: sort?.desc, manager, app_user: appUser };
  const q = useQuery({
    queryKey: ['orders', from, to, status, search, page, sort?.key, sort?.desc, manager, appUser],
    queryFn: () => api.fetchOrders({ from, to, status, search, page, size: SIZE, ...gridQ }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  const kbRows = q.data?.data.rows ?? [];
  const kb = useRowKeys(kbRows.length, (i) => { const k = kbRows[i]?.key; if (k) setOpen(String(k)); });
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  if (q.isPending) return <StillLoading />;
  if (q.isError && !q.data) {
    const d = describeError(asAppError(q.error));
    return (
      <Result status="warning" title={d.title} subTitle={d.text}
        extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
          <Button key="c" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />
    );
  }
  const { data: p, source, saved_at } = q.data!;
  const columns = p.columns.map((c) => ({
    title: c.title, dataIndex: c.key, key: c.key, ellipsis: true,
    align: MONEY_COLUMNS.has(c.key) ? ('right' as const) : undefined,
    sorter: true, sortOrder: sort?.key === c.key ? (sort.desc ? 'descend' as const : 'ascend' as const) : null,
    render: MONEY_COLUMNS.has(c.key) ? (v: unknown) => money(v) : (v: unknown) => showDate(v) as React.ReactNode,
  }));

  return (
    <>
      <div className="page-title">
        <h2>{p.title}</h2>
        <span className="muted">{p.total.toLocaleString()} orders, total {money(p.sum_total)} (ex VAT {money(p.sum_ex_vat)})</span>
        <span className="muted">{source === 'offline' ? `Saved copy from ${syncedAgo(saved_at, now)}` : `Synced ${syncedAgo(saved_at, now)}`}</span>
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <ExportButton name={fileName(p.title, p.from, p.to)} sheet={p.title} disabled={source === 'offline' || !p.total}
          load={async () => {
            const all = (await api.fetchOrders({ from, to, status, search, page: 1, size: SIZE, ...gridQ, export: true })).data;
            return { columns: prefs.forExport(all.columns), rows: all.rows, cut: all.export_cut };
          }} />
        <MoreMenu items={[{ key: 'classic', label: 'Edit or approve in classic window', icon: <ExportOutlined />, onClick: () => openClassic(classicPath) }]} />
      </div>
      {source === 'offline' && (
        <Alert type="warning" showIcon style={{ marginBottom: 14 }} title="You are working offline"
          description="This is the last copy saved on this computer. Dates, searches and pages you have not opened before are not available." />
      )}
      {!!p.data_from && <Alert type="info" showIcon style={{ marginBottom: 12 }} title={`Your company is allowed data from ${dayjs(p.data_from).format('DD MMM YYYY')}.`} />}
      <DrillBanner t={drillIn} onClear={() => { setRange(null); setTyped(''); setSearch(''); setPage(1); }} />
      <div className="filters">
        <DatePicker.RangePicker allowClear value={range ?? [dayjs(p.from), dayjs(p.to)]}
          onChange={(v) => { setRange(v && v[0] && v[1] ? [v[0], v[1]] : null); setPage(1); }} />
        <Select allowClear placeholder="All statuses" style={{ minWidth: 160 }} value={status || undefined}
          onChange={(v) => { setStatus(v ?? ''); setPage(1); }}
          options={p.status_choices.map((s) => ({ value: s, label: s }))} />
        {p.grid?.filterable && (
          <GridFilters grid={p.grid} manager={manager} appUser={appUser} onChange={(m, u) => { setManager(m); setAppUser(u); setPage(1); }} />
        )}
        <Input.Search allowClear placeholder="Search" style={{ maxWidth: 280 }} value={typed}
          onChange={(e) => setTyped(e.target.value)} onSearch={(v) => { setSearch(v); setPage(1); }} />
        <span className="filters-end">
          <SavedViews page="orders" from={from} to={to} filters={{ status, search, manager, app_user: appUser }}
            onApply={(r, f) => { setRange(r ? [dayjs(r[0]), dayjs(r[1])] : null); setStatus(f.status ?? ''); setTyped(f.search ?? ''); setSearch(f.search ?? ''); setManager(f.manager ?? ''); setAppUser(f.app_user ?? ''); setPage(1); }} />
          <GridSettings columns={p.columns} prefs={prefs} />
        </span>
      </div>
      <div className="panel flush"><Table size={prefs.pref.size} rowKey={(r) => String(r.key ?? r.order_number)} columns={prefs.visible(columns)} dataSource={p.rows}
        loading={q.isFetching} scroll={{ x: 'max-content' }}
        onChange={(_pg, _f, sorter) => {
          const one = Array.isArray(sorter) ? sorter[0] : sorter;
          const key = one?.order ? String(one.columnKey ?? one.field ?? '') : '';
          setSort(key ? { key, desc: one.order === 'descend' } : null);
        }}
        onRow={(r, i) => ({ onClick: () => { kb.setAt(i ?? -1); setOpen(String(r.key)); }, style: { cursor: 'pointer' } })} rowClassName={(_r, i) => kb.rowClass(i)}
        pagination={{ current: p.page, pageSize: p.size, total: p.total, showSizeChanger: false, onChange: (n) => setPage(n) }} /></div>
      <OrderDetails orderKey={open} onClose={() => setOpen(null)} openClassic={openClassic} classicPath={classicPath} />
    </>
  );
}
