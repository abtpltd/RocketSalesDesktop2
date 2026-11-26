import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Checkbox, Input, Switch, Tag, Tooltip } from 'antd';
import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import type { Cap, DesktopCatalog, DesktopRules } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
type Pages = Record<string, Cap[]>;

/** Everything the page allows (the rules start from this when a role has none). */
const fullOf = (cat: DesktopCatalog): Pages => Object.fromEntries(cat.sections.flatMap((s) => s.items.map((i) => [i.path, [...i.caps]])));

/** Desktop app access of one role: per page View / Create / Edit / Delete / Approve / Export, and role settings. */
export default function DesktopAccessEditor({ role, catalog, saved }: {
  role: string; catalog: DesktopCatalog; saved: { rules: DesktopRules | null; base: string; assigned?: boolean } | undefined;
}) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const start = useMemo(() => {
    const full = fullOf(catalog);
    const pages: Pages = { ...full, ...Object.fromEntries(Object.entries(saved?.rules?.pages ?? {}).filter(([p]) => p in full)) };
    const settings = Object.fromEntries(catalog.settings.map((s) => [s.id, saved?.rules?.settings?.[s.id] ?? true]));
    return { pages, settings };
  }, [catalog, saved]);
  const [pages, setPages] = useState<Pages>(start.pages);
  const [settings, setSettings] = useState<Record<string, boolean>>(start.settings);
  const [assign, setAssign] = useState(!!saved?.assigned);
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPages(start.pages); setSettings(start.settings); setAssign(!!saved?.assigned); }, [start, saved]);

  const dirty = JSON.stringify(pages) !== JSON.stringify(start.pages) || JSON.stringify(settings) !== JSON.stringify(start.settings) || assign !== !!saved?.assigned;
  const has = (path: string, c: Cap) => (pages[path] ?? []).includes(c);
  const set = (paths: string[], c: Cap, on: boolean) => setPages((cur) => {
    const next = { ...cur };
    const caps = new Map(catalog.sections.flatMap((s) => s.items.map((i) => [i.path, i.caps])));
    for (const p of paths) {
      const allowed = caps.get(p) ?? [];
      if (!allowed.includes(c)) continue;
      let list = new Set(next[p] ?? []);
      if (on) { list.add(c); list.add('view'); } else if (c === 'view') list = new Set(); else list.delete(c);
      next[p] = allowed.filter((x) => list.has(x));
    }
    return next;
  });
  const preset = (kind: 'full' | 'view' | 'none') => {
    const full = fullOf(catalog);
    setPages(Object.fromEntries(Object.entries(full).map(([p, caps]) => [p, kind === 'full' ? caps : kind === 'view' ? caps.filter((c) => c === 'view' || c === 'export') : []])));
  };
  const save = async () => {
    setBusy(true);
    try {
      const res = await api.saveSetup('roles', { part: 'desktop', role, pages, settings, assign, base: saved?.base ?? '', request_id: newId() });
      if (res.ok) { void message.success(res.message); await qc.invalidateQueries({ queryKey: ['setup', 'roles'] }); }
      else void message.error(res.message || 'Not saved.');
    } catch (e) {
      const d = describeError(asAppError(e)); void message.error(`${d.title}. ${d.text}`); report(e);
    } finally { setBusy(false); }
  };

  const total = Object.keys(pages).length;
  const shown = Object.values(pages).filter((c) => c.includes('view')).length;
  const q = find.trim().toLowerCase();

  return (
    <div className="dacc">
      <div className="dacc-bar">
        <Input.Search allowClear placeholder="Find a page" style={{ maxWidth: 260 }} value={find} onChange={(e) => setFind(e.target.value)} />
        <span className="muted">Set all:</span>
        <Button size="small" onClick={() => preset('full')}>Full</Button>
        <Button size="small" onClick={() => preset('view')}>View and export</Button>
        <Button size="small" onClick={() => preset('none')}>Nothing</Button>
        <span className="grow" />
        <span className="muted">{shown} of {total} pages{dirty ? ', not saved' : ''}</span>
        <Button icon={<UndoOutlined />} disabled={!dirty || busy} onClick={() => { setPages(start.pages); setSettings(start.settings); setAssign(!!saved?.assigned); }}>Discard</Button>
        <Button type="primary" icon={<SaveOutlined />} disabled={!dirty} loading={busy} onClick={() => void save()}>Save desktop access</Button>
      </div>
      {!saved?.rules && <Alert type="info" showIcon style={{ margin: '0 0 12px' }} title="Not limited yet"
        description="This role can do everything its web access allows in the desktop app. Untick what it should not do, then save." />}
      <label className="dacc-setting" style={{ marginBottom: 10 }}>
        <Switch checked={assign} onChange={setAssign} />
        <span><b>Give exactly the ticked pages</b><small>On: this role gets the pages ticked View from the company's whole menu, even pages its web role does not have, and nothing else. Off: the ticks can only take pages and actions away from what its web role allows.</small></span>
      </label>
      <div className="dacc-settings">
        {catalog.settings.map((s) => (
          <label key={s.id} className="dacc-setting">
            <Switch checked={settings[s.id] !== false} onChange={(v) => setSettings({ ...settings, [s.id]: v })} />
            <span><b>{s.label}</b><small>{s.help}</small></span>
          </label>
        ))}
      </div>
      {catalog.sections.map((sec) => {
        const items = sec.items.filter((i) => !q || i.title.toLowerCase().includes(q));
        if (!items.length) return null;
        const paths = items.map((i) => i.path);
        return (
          <div key={sec.id} className="dacc-section">
            <table>
              <thead>
                <tr>
                  <th className="dacc-page">{sec.title} <Tag bordered={false}>{items.filter((i) => has(i.path, 'view')).length} of {items.length}</Tag></th>
                  {catalog.caps.map((c) => {
                    const able = items.filter((i) => i.caps.includes(c.id));
                    const on = able.filter((i) => has(i.path, c.id)).length;
                    return (
                      <th key={c.id}>
                        {able.length ? (
                          <Tooltip title={`${c.label}: all pages in ${sec.title}`}>
                            <Checkbox checked={on === able.length} indeterminate={on > 0 && on < able.length}
                              onChange={(e) => set(paths, c.id, e.target.checked)}>{c.label}</Checkbox>
                          </Tooltip>
                        ) : <span className="muted">{c.label}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.path} className={has(i.path, 'view') ? '' : 'off'}>
                    <td className="dacc-page">{i.title}<small>{i.path}</small></td>
                    {catalog.caps.map((c) => (
                      <td key={c.id}>
                        {i.caps.includes(c.id)
                          ? <Checkbox checked={has(i.path, c.id)} aria-label={`${c.label} ${i.title}`} onChange={(e) => set([i.path], c.id, e.target.checked)} />
                          : <span className="na" aria-hidden>-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
