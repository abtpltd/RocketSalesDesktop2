import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Drawer, Input, Result, Space, Switch, Table, Tag } from 'antd';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppUserRow, UserSettingsPayload } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import { changedFlags } from './trainingMath';
import { isSupport } from '../ui/support';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/** App User Settings: which activities and settings each active app user has in the field app. One user at a time. */
export default function AppUserSettingsPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const q = useQuery({ queryKey: ['setup', 'app_user_settings'], queryFn: () => api.fetchSetup<UserSettingsPayload>('app_user_settings'), staleTime: 0 });
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<AppUserRow | null>(null);
  const p = q.data;
  const rows = useMemo(() => (p?.users ?? []).filter((u) => !search || `${u.name} ${u.code}`.toLowerCase().includes(search.toLowerCase())), [p, search]);

  if (q.isPending) return <StillLoading />;
  if (q.isError || !p) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  const count = (u: AppUserRow, g: string) => p.flags.filter((f) => f.group === g && f.name !== 'status' && u[f.name]).length;
  return (
    <>
      <div className="page-title">
        <h2>{p.title}</h2>
        <span className="muted">{p.users.length} active app users</span>
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
      </div>
      <div className="filters"><Input.Search allowClear placeholder="Search name or code" style={{ maxWidth: 280 }} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="panel flush">
        <Table size="small" rowKey="key" dataSource={rows} pagination={{ pageSize: 50, hideOnSinglePage: true }}
          onRow={(u) => ({ onClick: () => setOpen(u), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'App user', key: 'n', render: (_: unknown, u: AppUserRow) => `${u.name} (${u.code})` },
            { title: 'Activities on', key: 'a', align: 'right' as const, render: (_: unknown, u: AppUserRow) => count(u, 'activities') },
            { title: 'Settings on', key: 's', align: 'right' as const, render: (_: unknown, u: AppUserRow) => count(u, 'settings') },
            { title: 'Pipeline stages', key: 'p', render: (_: unknown, u: AppUserRow) => u.pipelineStags.map((s) => <Tag key={s}>{s}</Tag>) },
          ]} />
      </div>
      {open && <UserEditor key={open.key} payload={p} user={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function UserEditor({ payload: p, user, onClose }: { payload: UserSettingsPayload; user: AppUserRow; onClose: () => void }) {
  const { api, report, state } = useSession();
  const canStatus = p.can_change_status ?? (state.status === 'in' && isSupport(state.info.user.email));
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(p.flags.map((f) => [f.name, Boolean(user[f.name])])));
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newId);
  const changes = changedFlags(user, flags);
  const n = Object.keys(changes).length;

  const save = async () => {
    setSaving(true); setProblem(null);
    try {
      const res = await api.saveSetup('app_user_settings', { request_id: requestId, key: user.key, changes });
      if (!res.ok) { setProblem(res.message || 'Not saved.'); setRequestId(newId()); return; }
      void message.success(res.message || 'Updated');
      void qc.invalidateQueries({ queryKey: ['setup', 'app_user_settings'] });
      onClose();
    } catch (e) {
      const d = describeError(asAppError(e)); setProblem(`${d.title}. ${d.text}`); setRequestId(newId()); report(e);
    } finally { setSaving(false); }
  };
  const group = (g: 'activities' | 'settings', title: string) => (
    <section className="panel" style={{ marginBottom: 12 }}>
      <div className="panel-head"><h3>{title}</h3>
        <Space><Button size="small" onClick={() => setFlags((f) => ({ ...f, ...Object.fromEntries(p.flags.filter((x) => x.group === g && x.name !== 'status').map((x) => [x.name, true])) }))}>All on</Button>
          <Button size="small" onClick={() => setFlags((f) => ({ ...f, ...Object.fromEntries(p.flags.filter((x) => x.group === g && x.name !== 'status').map((x) => [x.name, false])) }))}>All off</Button></Space>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
        {p.flags.filter((f) => f.group === g && f.name !== 'status').map((f) => (
          <label key={f.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Switch size="small" checked={flags[f.name]} onChange={(v) => setFlags((x) => ({ ...x, [f.name]: v }))} /> {f.label}
          </label>
        ))}
      </div>
    </section>
  );
  return (
    <Drawer open onClose={onClose} size={Math.min(980, window.innerWidth)} title={`${user.name} (${user.code})`}
      footer={<Space style={{ float: 'right' }}><Button onClick={onClose}>Cancel</Button>
        <Button type="primary" icon={<SaveOutlined />} disabled={!n} loading={saving} onClick={() => void save()}>Save{n ? ` (${n})` : ''}</Button></Space>}>
      <div className="filters">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Switch checked={flags.status} disabled={!canStatus} onChange={(v) => setFlags((x) => ({ ...x, status: v }))} /> Status (can use the app)
          {!canStatus && <span className="muted">Only the support account can change this.</span>}
        </label>
      </div>
      {!flags.status && <Alert type="warning" showIcon style={{ marginBottom: 12 }}
        title="Turning Status off signs this user out of the app and frees their phone, as the web page does. They leave this list." />}
      {problem && <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problem} />}
      {group('activities', 'Activities')}
      {group('settings', 'Settings')}
      <p className="muted">Pipeline stages and office check-in places are kept as they are ({user.pipelineStags.length} stage(s),{' '}
        {user.assignOfficeCheckIn.length} place(s)); change them on the app user's record.</p>
    </Drawer>
  );
}
