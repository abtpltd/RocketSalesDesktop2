import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Checkbox, Empty } from 'antd';
import { SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import type { RolesPayload } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';

type Menu = NonNullable<RolesPayload['menu_v2']>;
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/** Menu V2 companies: which parent menus and pages of the company menu one role sees (nothing ticked = the whole company menu). */
export default function RoleMenuEditor({ roleKey, role, menu, saved }: { roleKey: string; role: string; menu: Menu; saved: string[] }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const { message } = AntApp.useApp();
  const [ids, setIds] = useState<string[]>(saved);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const savedKey = saved.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setIds(saved); setProblem(null); }, [savedKey, roleKey]);
  const on = useMemo(() => new Set(ids), [ids]);
  const dirty = JSON.stringify([...ids].sort()) !== JSON.stringify([...saved].sort());
  if (!menu.enabled) return <Alert type="info" showIcon title="This company uses the standard menu. The provider can switch on a custom menu (Menu V2) first." />;
  if (!menu.menu.length) return <Empty description="The company menu has no pages." />;
  const flip = (list: string[], v: boolean) => setIds((cur) => (v ? [...new Set([...cur, ...list])] : cur.filter((x) => !list.includes(x))));
  const save = async () => {
    setSaving(true); setProblem(null);
    try {
      await api.saveSetup('roles', { part: 'menu', key: roleKey, ids, request_id: newId() });
      await qc.invalidateQueries({ queryKey: ['setup', 'roles'] });
      void message.success(ids.length ? 'Menu saved' : 'This role now sees the whole company menu');
    } catch (e) { setProblem(describeError(asAppError(e)).text); } finally { setSaving(false); }
  };
  return (
    <div className="roles-menu">
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        title={`Tick what ${role} sees in the web menu. Leave everything unticked to give the whole company menu.`} />
      {problem && <Alert type="error" showIcon style={{ marginBottom: 12 }} title={problem} />}
      {menu.menu.map((p) => {
        const subs = p.subs.map((s) => s.id);
        const n = subs.filter((s) => on.has(s)).length;
        return (
          <div key={p.id} style={{ marginBottom: 10 }}>
            <Checkbox checked={n > 0 && n === subs.length} indeterminate={n > 0 && n < subs.length} onChange={(e) => flip(subs, e.target.checked)}><b>{p.title}</b></Checkbox>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', paddingLeft: 24, marginTop: 4 }}>
              {p.subs.map((s) => <Checkbox key={s.id} checked={on.has(s.id)} onChange={(e) => flip([s.id], e.target.checked)}>{s.title}</Checkbox>)}
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button type="primary" icon={<SaveOutlined />} disabled={!dirty} loading={saving} onClick={() => void save()}>Save menu</Button>
        <Button icon={<UndoOutlined />} disabled={!dirty || saving} onClick={() => setIds(saved)}>Discard</Button>
        <Button disabled={!ids.length || saving} onClick={() => setIds([])}>Whole company menu</Button>
      </div>
    </div>
  );
}
