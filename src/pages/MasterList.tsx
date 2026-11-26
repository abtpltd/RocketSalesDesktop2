import { useRowKeys } from '../ui/useRowKeys';
import { GridSettings, SavedViews, useGridPrefs } from '../ui/GridPrefs';
import MoreMenu from '../ui/MoreMenu';
import { DrillBanner, useDrillIn } from '../drill';
import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Input, Result, Segmented, Table } from 'antd';
import { EditOutlined, ExportOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import RecordForm from '../ui/RecordForm';
import Profile360 from './Profile360';
import ActionBar from '../ui/ActionBar';
import type { MasterListPayload, RecordAction } from '../api/types';
import { FORM_FOR_LIST } from '../ui/formsMap';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { describeError, syncedAgo } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import ExportButton from '../ui/ExportButton';
import GridFilters from '../ui/GridFilters';
import { showDate } from '../ui/dates';
import { fileName } from '../ui/excel';
import { useCan } from '../access';
import { isSupport } from '../ui/support';

const SIZE = 100;

/** A read-only master data list (products, customers, doctors) with search and paging. */
/** Lists the app keeps its own copy of. App users are left out: their "signed in" mark changes without the record changing. */
const LOCAL_LISTS = ['products', 'customers', 'doctors', 'prospects_grid'];
const gridCache = new Map<string, MasterListPayload['grid']>();

export default function MasterList({ module, title, openClassic, classicPath }: {
  module: string; title: string; classicPath: string; openClassic: (path: string) => void;
}) {
  const { api, report, setOffline, state } = useSession();
  const supportUser = state.status === 'in' && isSupport(state.info.user.email);
  const { message } = AntApp.useApp();
  const drillIn = useDrillIn(classicPath);
  const prefs = useGridPrefs(`master:${module}`);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const canCreate = useCan('create');
  const profileKind = module === 'customers' ? 'customer' as const : module === 'doctors' ? 'doctor' as const : null;
  const [profile, setProfile] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ key: string | null } | null>(null);
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const [manager, setManager] = useState('');
  const [appUser, setAppUser] = useState('');
  const formMeta = FORM_FOR_LIST[module];
  const formName = formMeta?.form;
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => { setTyped(''); setSearch(''); setPage(1); setStatus(''); setSort(null); setManager(''); setAppUser(''); }, [module]);
  useEffect(() => { const t = setTimeout(() => { setSearch(typed); setPage(1); }, 350); return () => clearTimeout(t); }, [typed]);
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000); return () => clearInterval(t); }, []);

  const gridQ = { sort: sort?.key, desc: sort?.desc, manager, app_user: appUser };
  const q = useQuery({
    queryKey: ['master', module, search, page, status, sort?.key, sort?.desc, manager, appUser],
    queryFn: async () => {
      const q = { module, search, page, size: SIZE, status, ...gridQ };
      // this computer's own copy, kept up to date with changes only; the first view of a list in a session comes from the
      // server (it carries the manager filters), the rest is read locally
      if (LOCAL_LISTS.includes(module) && !manager && !appUser && gridCache.has(module)) {
        try {
          const s = await api.syncList(module);
          const r = await api.localList(q);
          return { ...r, source: s.offline ? 'offline' : 'server', data: { ...r.data, grid: gridCache.get(module) } } as typeof r;
        } catch { /* no copy yet, or the server refused: use the server list below */ }
      }
      const r = await api.fetchMasterList(q);
      if (LOCAL_LISTS.includes(module) && r.source === 'server') {
        gridCache.set(module, r.data.grid);
        void api.syncList(module).catch(() => {});
      }
      return r;
    },
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  const kbRows = (q.data?.data.rows ?? []) as Record<string, unknown>[];
  const kb = useRowKeys(kbRows.length, (i) => {
    const k = kbRows[i]?.key;
    if (!k) return;
    if (profileKind) setProfile(String(k)); else if (formMeta?.edit) setEditing({ key: String(k) });
  });
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
  const { data: payload, source, saved_at } = q.data!;
  const hasActions = payload.rows.some((r) => Array.isArray((r as Record<string, unknown>).actions));
  const isAppUsers = module === 'app_users';
  // App users: the signed-in state leads the row as a dot (green live, grey not live)
  // App users: the signed-in dot leads; Location and Transfer stock location are not shown
  const cols = isAppUsers ? [...payload.columns.filter((c) => c.key === 'live'), ...payload.columns.filter((c) => c.key !== 'live' && c.key !== 'location' && c.key !== 'stock_location')] : payload.columns;
  const columns = [
    ...cols.map((c) => ({
      title: isAppUsers && c.key === 'live' ? '' : c.title, dataIndex: c.key, key: c.key, ellipsis: !(isAppUsers && c.key === 'live'),
      width: isAppUsers && c.key === 'live' ? 44 : undefined,
      sorter: true, sortOrder: sort?.key === c.key ? (sort.desc ? 'descend' as const : 'ascend' as const) : null,
      render: isAppUsers && c.key === 'live'
        ? (v: unknown) => <span className={`live-dot${v === 'LIVE' ? ' on' : ''}`} role="img" aria-label={v === 'LIVE' ? 'Live' : 'Not live'} title={v === 'LIVE' ? 'Live' : 'Not live'} />
        : (v: unknown) => showDate(v) as React.ReactNode,
    })),
    ...(isAppUsers && source !== 'offline' ? [{
      // reset session second last, edit last
      title: '', key: '__appuser', fixed: 'right' as const, width: 96,
      render: (_: unknown, r: Record<string, unknown>) => (
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', gap: 6 }}>
          <ActionBar size="small" iconOnly actions={(r.actions as RecordAction[]) ?? []} recordKey={String(r.key)} refresh={[['master', module]]} />
          <Button size="small" icon={<EditOutlined />} title="Edit" aria-label="Edit" onClick={() => setEditing({ key: String(r.key) })} />
        </span>
      ),
    }] : []),
    ...(hasActions && !isAppUsers && source !== 'offline' ? [{
      title: 'Actions', key: '__actions', fixed: 'right' as const,
      render: (_: unknown, r: Record<string, unknown>) => (
        <ActionBar size="small" actions={(r.actions as RecordAction[]) ?? []} recordKey={String(r.key)} refresh={[['master', module]]} />
      ),
    }] : []),
  ];

  return (
    <>
      <div className="page-title">
        <h2>{title}</h2>
        <span className="muted">{payload.total.toLocaleString()} found</span>
        <span className="muted">{source === 'offline' ? `Saved copy from ${syncedAgo(saved_at, now)}` : `Synced ${syncedAgo(saved_at, now)}`}</span>
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <ExportButton name={fileName(title)} sheet={title} disabled={source === 'offline' || !payload.total}
          load={async () => {
            const all = (await api.fetchMasterList({ module, search, page: 1, size: SIZE, status, ...gridQ, export: true })).data;
            const exportCols = all.columns.map((c) => (isAppUsers && c.key === 'live' ? { ...c, title: 'Signed in' } : c));
            const rows = isAppUsers ? all.rows.map((r) => ({ ...r, has_device: undefined, live: r.live === 'LIVE' ? 'Live' : 'Not live' })) : all.rows;
            return { columns: prefs.forExport(exportCols), rows, cut: all.export_cut };
          }} />
        {formMeta?.add && canCreate && (!isAppUsers || supportUser) && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ key: null })}>Add</Button>}
        <MoreMenu items={[{ key: 'classic', icon: <ExportOutlined />, onClick: () => openClassic(classicPath),
          label: module.endsWith('_verification') ? 'Verify in classic window' : formName ? 'Open in classic window' : 'Add or edit in classic window' }]} />
      </div>
      {source === 'offline' && (
        <Alert type="warning" showIcon style={{ marginBottom: 14 }} title="You are working offline"
          description="This is the last copy saved on this computer. Searches and pages you have not opened before are not available." />
      )}
      <DrillBanner t={drillIn} />
      <div className="filters">
        <Input.Search allowClear placeholder="Search" style={{ maxWidth: 320 }} value={typed}
          onChange={(e) => setTyped(e.target.value)} onSearch={(v) => { setSearch(v); setPage(1); }} />
        {payload.status_choices.length > 0 && (
          <Segmented value={status || payload.status_choices[0]} onChange={(v) => { setStatus(String(v)); setPage(1); }}
            options={payload.status_choices.map((s) => ({ label: s[0].toUpperCase() + s.slice(1), value: s }))} />
        )}
        {payload.grid?.filterable && (
          <GridFilters grid={payload.grid} manager={manager} appUser={appUser} showAppUser={!isAppUsers}
            onChange={(m, u) => { setManager(m); setAppUser(u); setPage(1); }} />
        )}
        {isAppUsers && (
          <span className="legend-inline"><span className="live-dot on" /> Live <span className="live-dot" /> Not live <span className="nodev-key">Red</span> no device registered</span>
        )}
        <span className="filters-end">
          <SavedViews page={`master:${module}`} from="" to="" filters={{ search, status, manager, app_user: appUser }}
            onApply={(_r, f) => { setTyped(f.search ?? ''); setSearch(f.search ?? ''); setStatus(f.status ?? ''); setManager(f.manager ?? ''); setAppUser(f.app_user ?? ''); setPage(1); }} />
          <GridSettings columns={cols.map((c) => ({ key: c.key, title: isAppUsers && c.key === 'live' ? 'Signed in' : c.title }))} prefs={prefs} />
        </span>
      </div>
      <div className="panel flush"><Table size={prefs.pref.size} rowKey={(r) => String(r.key ?? r.code)} columns={prefs.visible(columns)} dataSource={payload.rows}
        loading={q.isFetching && !q.isPlaceholderData ? true : q.isPlaceholderData}
        scroll={{ x: 'max-content' }}
        rowClassName={(r, i) => [isAppUsers && (r as Record<string, unknown>).has_device === false ? 'row-nodevice' : '', kb.rowClass(i)].filter(Boolean).join(' ')}
        onChange={(_pg, _f, sorter) => {
          const one = Array.isArray(sorter) ? sorter[0] : sorter;
          const key = one?.order ? String(one.columnKey ?? one.field ?? '') : '';
          setSort(key ? { key, desc: one.order === 'descend' } : null);
        }}
        onRow={formMeta?.edit || profileKind ? (r) => ({ onClick: () => (!r.key ? void message.warning('This record cannot be opened here: it is not saved under this company. Open it in the classic window.') : profileKind ? setProfile(String(r.key)) : setEditing({ key: String(r.key) })), style: { cursor: 'pointer' } }) : undefined}
        pagination={{ current: payload.page, pageSize: payload.size, total: payload.total, showSizeChanger: false,
          onChange: (p) => setPage(p) }} /></div>
      {profileKind && <Profile360 kind={profileKind} recordKey={profile} onClose={() => setProfile(null)}
        onEdit={formMeta?.edit ? () => { setEditing({ key: profile }); setProfile(null); } : undefined} />}
      {formName && <RecordForm name={formName} presets={formMeta?.presets} recordKey={editing?.key ?? null} open={!!editing} onClose={() => setEditing(null)} />}
    </>
  );
}
