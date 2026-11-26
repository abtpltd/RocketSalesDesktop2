import MoreMenu from '../ui/MoreMenu';
import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Checkbox, Empty, Input, Result, Switch, Tabs, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined, SaveOutlined, SafetyCertificateOutlined, UndoOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoleChoice, RoleRow, RolesPayload } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import DesktopAccessEditor from './DesktopAccessEditor';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
interface Draft { key: string; role: string; description: string; weblogin: boolean; modules: Set<string>; dashboard: Set<string>; base: string }
const draftOf = (r: RoleRow | null): Draft => ({
  key: r?.key ?? '', role: r?.role ?? '', description: r?.description ?? '', weblogin: r?.weblogin ?? true,
  modules: new Set(r?.modules ?? []), dashboard: new Set(r?.dashboard ?? []), base: r?.base ?? '',
});
const same = (a: Draft, b: Draft) => a.role === b.role && a.description === b.description && a.weblogin === b.weblogin
  && a.modules.size === b.modules.size && [...a.modules].every((m) => b.modules.has(m))
  && a.dashboard.size === b.dashboard.size && [...a.dashboard].every((m) => b.dashboard.has(m));

/** Back-office user roles: which menu pages and settings each role may use (administrators only). */
export default function RolesPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const { message, modal } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['setup', 'roles'], queryFn: () => api.fetchSetup<RolesPayload>('roles'), staleTime: 0 });
  const [selected, setSelected] = useState<string | null>(null); // a role key, '' for a new role
  const [draft, setDraft] = useState<Draft>(draftOf(null));
  const [find, setFind] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(newId);
  const [tab, setTab] = useState<'desktop' | 'web'>('desktop');
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  const roles = q.data?.roles ?? [];
  const original = useMemo(() => (selected === '' ? draftOf(null) : draftOf(roles.find((r) => r.key === selected) ?? null)), [selected, roles]);
  useEffect(() => {
    if (selected == null && roles.length) setSelected(roles[0].key);
  }, [roles, selected]);
  useEffect(() => { setDraft(original); setProblem(null); setRequestId(newId()); }, [original]);

  if (q.isPending) return <StillLoading />;
  if (q.isError || !q.data) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  const cat = q.data.catalog;
  const webMenu = q.data.web_menu?.length ? q.data.web_menu : null;
  const menuIds = new Set((webMenu ?? []).flatMap((g) => [g.id, ...g.items.map((i) => i.id)]).filter(Boolean));
  const dirty = !same(draft, original);
  const pick = (next: string | null) => {
    if (!dirty) { setSelected(next); return; }
    modal.confirm({ title: 'Discard unsaved changes?', content: 'The changes to this role are not saved.', okText: 'Discard', onOk: () => setSelected(next) });
  };
  const toggle = (field: 'modules' | 'dashboard', names: string[], on: boolean) => setDraft((d) => {
    const set = new Set(d[field]);
    names.forEach((n) => (on ? set.add(n) : set.delete(n)));
    return { ...d, [field]: set };
  });
  const save = async () => {
    if (!draft.role.trim()) { setProblem('Enter the role title.'); return; }
    setSaving(true); setProblem(null);
    try {
      const res = await api.saveSetup('roles', { request_id: requestId, key: draft.key, base: draft.base, role: draft.role.trim(),
        description: draft.description, weblogin: draft.weblogin, modules: [...draft.modules], dashboard: [...draft.dashboard] });
      if (!res.ok) { setProblem(res.message || 'Not saved.'); setRequestId(newId()); return; }
      void message.success(res.message || 'Role saved');
      setRequestId(newId());
      const fresh = await qc.fetchQuery({ queryKey: ['setup', 'roles'], queryFn: () => api.fetchSetup<RolesPayload>('roles'), staleTime: 0 });
      if (selected === '') {
        const made = fresh.roles.find((r) => r.role === draft.role.trim().toUpperCase());
        if (made) { setSelected(made.key); setTab('desktop'); void message.info('Role created. Now tick what it may do in the desktop app, then Save desktop access.'); }
      }
    } catch (e) {
      const d = describeError(asAppError(e)); setProblem(`${d.title}. ${d.text}`); setRequestId(newId()); report(e);
    } finally { setSaving(false); }
  };
  const shown = roles.filter((r) => !find || r.role.toLowerCase().includes(find.toLowerCase()));
  const dashGroups: [string, RoleChoice[]][] = [['Dashboard KPI tables', cat.dashboard], ['Dashboard count cards', cat.cards], ['Dashboard charts', cat.charts]];

  return (
    <div className="roles">
      <div className="page-title">
        <h2>{q.data.title}</h2>
        <span className="muted">{roles.length} roles</span>
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <MoreMenu items={[{ key: 'classic', label: 'Open in classic window', onClick: () => openClassic(classicPath) }]} />
      </div>
      <div className="roles-body">
        <aside className="roles-list">
          <div className="roles-list-head">
            <Input.Search allowClear placeholder="Find a role" value={find} onChange={(e) => setFind(e.target.value)} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => pick('')}>New role</Button>
          </div>
          {selected === '' && <button type="button" className="role-item sel"><b>New role</b><small>Not saved yet</small></button>}
          {shown.map((r) => (
            <button key={r.key} type="button" className={`role-item${r.key === selected ? ' sel' : ''}`} onClick={() => pick(r.key)}>
              <b>{r.role}</b>
              <small>{r.modules.length} pages{r.weblogin ? '' : ', no web login'}</small>
            </button>
          ))}
          {!shown.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No roles found" />}
        </aside>

        <section className="roles-edit">
          <header className="roles-edit-head">
            <span className="roles-icon"><SafetyCertificateOutlined /></span>
            <div className="roles-fields">
              <Input size="large" placeholder="Role title" value={draft.role} disabled={!!draft.key} maxLength={60}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })} aria-label="Role title" />
              <Input.TextArea placeholder="Description" autoSize={{ minRows: 1, maxRows: 3 }} value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })} aria-label="Description" />
            </div>
            <label className="roles-web"><Switch checked={draft.weblogin} onChange={(v) => setDraft({ ...draft, weblogin: v })} /> Web login</label>
          </header>
          <Tabs className="roles-tabs" activeKey={tab} onChange={(k) => setTab(k as 'desktop' | 'web')} items={[
            { key: 'desktop', label: 'Desktop app', children: (
              <div className="roles-desktop">
                {!q.data.desktop ? <Alert type="warning" showIcon title="Update the server to set desktop access." />
                  : !draft.key ? <Alert type="info" showIcon title="Enter the title, tick its menus on the Menus & web access tab and press Create role. The desktop permissions open here right after." />
                  : draft.role === 'ADMIN' ? <Alert type="info" showIcon title="Administrators always have full access in the desktop app." />
                  : <DesktopAccessEditor key={draft.key} role={draft.role} catalog={q.data.desktop.catalog} saved={q.data.desktop.roles[draft.role]} />}
              </div>) },
            { key: 'web', label: webMenu ? 'Menus & web access' : 'Web access', children: (<>
          {problem && <Alert type="error" showIcon style={{ margin: '0 18px 12px' }} title={problem} />}
            <div className="roles-groups">
              {webMenu && (
                <div className="role-menus-note">
                  <Alert type="info" showIcon title="Menus of this company"
                    description="Every menu the provider gives this company, Settings & Admin included. A role gets only the menus ticked here, in the web back office and in the desktop app. Administrators always see all of them." />
                </div>
              )}
              {webMenu?.map((m) => {
                const gated = m.items.filter((i) => i.gated);
                const names = [...(m.gated && m.id ? [m.id] : []), ...gated.map((i) => i.id)].filter((n, k, a) => a.indexOf(n) === k);
                const on = names.filter((n) => draft.modules.has(n)).length;
                return (
                  <div key={`menu-${m.id}-${m.title}`} className="role-group">
                    <div className="role-group-head">
                      {names.length
                        ? <Checkbox checked={on === names.length} indeterminate={on > 0 && on < names.length}
                            onChange={(e) => toggle('modules', names, e.target.checked)}><b>{m.title}</b></Checkbox>
                        : <b>{m.title}</b>}
                      <Tag bordered={false}>{m.single ? (on ? 'on' : 'off') : `${gated.filter((i) => draft.modules.has(i.id)).length} of ${m.items.length}`}</Tag>
                    </div>
                    {!m.single && (
                      <div className="role-items">
                        {gated.map((i) => (
                          <Checkbox key={i.path} checked={draft.modules.has(i.id)}
                            onChange={(e) => {
                              const rest = gated.filter((x) => x.id !== i.id && draft.modules.has(x.id));
                              if (e.target.checked) toggle('modules', m.gated && m.id ? [i.id, m.id] : [i.id], true);
                              else toggle('modules', m.gated && m.id && !rest.length ? [i.id, m.id] : [i.id], false);
                            }}>{i.title}</Checkbox>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {webMenu && <div className="role-menus-note"><b>Other rights</b><span className="muted"> create, edit, approve and other settings of the web back office</span></div>}
              {cat.groups.map((g0) => {
                const g = webMenu ? { ...g0, items: g0.items.filter((i) => !menuIds.has(i.name)) } : g0;
                if (webMenu && !g.items.length && (!g.head || menuIds.has(g.head))) return null;
                const shownHead = g.head && !(webMenu && menuIds.has(g.head)) ? g.head : null;
                const names = [...(shownHead ? [shownHead] : []), ...g.items.map((i) => i.name)];
                const on = names.filter((n) => draft.modules.has(n)).length;
                return (
                  <div key={g.title} className="role-group">
                    <div className="role-group-head">
                      <Checkbox checked={on === names.length && names.length > 0} indeterminate={on > 0 && on < names.length}
                        onChange={(e) => toggle('modules', names, e.target.checked)}><b>{g.title}</b></Checkbox>
                      <Tag bordered={false}>{on} of {names.length}</Tag>
                    </div>
                    <div className="role-items">
                      {g.items.map((i) => (
                        <Checkbox key={i.name} checked={draft.modules.has(i.name)}
                          onChange={(e) => {
                            // turning a page on turns its section on; turning the last page off turns the section off too
                            const rest = g.items.filter((x) => x.name !== i.name && draft.modules.has(x.name));
                            if (e.target.checked) toggle('modules', g.head ? [i.name, g.head] : [i.name], true);
                            else toggle('modules', g.head && !rest.length ? [i.name, g.head] : [i.name], false);
                          }}>{i.label}</Checkbox>
                      ))}
                    </div>
                  </div>
                );
              })}
              {dashGroups.filter(([, list]) => list.length).map(([title, list]) => {
                const on = list.filter((d) => draft.dashboard.has(d.name)).length;
                return (
                  <div key={title} className="role-group dash">
                    <div className="role-group-head">
                      <Checkbox checked={on === list.length} indeterminate={on > 0 && on < list.length}
                        onChange={(e) => toggle('dashboard', list.map((d) => d.name), e.target.checked)}><b>{title}</b></Checkbox>
                      <Tag bordered={false}>{on} of {list.length}</Tag>
                    </div>
                    <div className="role-items">
                      {list.map((d) => <Checkbox key={d.name} checked={draft.dashboard.has(d.name)} onChange={(e) => toggle('dashboard', [d.name], e.target.checked)}>{d.label}</Checkbox>)}
                    </div>
                  </div>
                );
              })}
            </div>
            <footer className="roles-foot">
              <span className="muted">{draft.modules.size} pages and settings allowed{dirty ? ', not saved' : ''}</span>
              <Button icon={<UndoOutlined />} disabled={!dirty || saving} onClick={() => setDraft(original)}>Discard</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty} onClick={() => void save()}>{draft.key ? 'Save role' : 'Create role'}</Button>
            </footer>
            </>) },
          ]} />
        </section>
      </div>
    </div>
  );
}
