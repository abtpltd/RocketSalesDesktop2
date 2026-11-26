import { useEffect, useState } from 'react';
import { App as AntApp, Alert, Button, InputNumber, Select, Switch } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { describeError } from '../api/messages';
import type { JointSettings } from '../api/types';
import { asAppError, useSession } from '../session';

export const JOINT_DEFAULTS: JointSettings = {
  enabled: false, confirm: 'app', otp: false, distance_rule: 'flag', distance_meters: 300, max_people: 5, invite_scope: 'hierarchy', auto_close: true,
};

/** Company settings for joint calls. Everyone with the page open sees them; only an administrator can change them. */
export default function JointAdmin({ admin }: { admin: boolean }) {
  const { api, state } = useSession();
  const company = state.status === 'in' ? state.info.company.domain : '';
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['joint-settings', company], enabled: !!company, staleTime: 5 * 60_000,
    // a server without these settings yet means "joint calls off", never an error on this page
    queryFn: async (): Promise<JointSettings> => { try { return { ...JOINT_DEFAULTS, ...(await api.fetchJoint()) }; } catch { return JOINT_DEFAULTS; } },
  });
  const settings = q.data ?? JOINT_DEFAULTS;
  const [s, setS] = useState<JointSettings>(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setS(settings); }, [settings]);
  const set = <K extends keyof JointSettings>(k: K, v: JointSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const save = async () => {
    setBusy(true);
    try {
      const { message: done, ...saved } = await api.saveJoint(s);
      await qc.invalidateQueries({ queryKey: ['joint-settings'] });
      setS(saved as JointSettings);
      void message.success(done || 'Joint-call settings saved');
    } catch (e) {
      const d = describeError(asAppError(e));
      void message.error(asAppError(e).code === 'not_found' ? 'Your server does not have these settings yet. Ask your developer to update the server first.' : `${d.title}. ${d.text}`);
    } finally { setBusy(false); }
  };
  const row = (label: string, hint: string, body: React.ReactNode) => (
    <div className="aa-row"><div><b>{label}</b><div className="muted">{hint}</div></div><div>{body}</div></div>
  );
  const off = !admin;
  return (
    <div className="aa">
      {!admin && <Alert type="info" showIcon style={{ marginBottom: 10 }} title="Only your company administrator can change these." />}
      {row('Joint calls', 'Two or more people on one visit. Each person keeps their own visit and figures; the back office shows one row. Off: nothing changes.',
        <Switch disabled={off} checked={s.enabled} onChange={(v) => set('enabled', v)} />)}
      {row('How a visit is confirmed', 'None: the invite is enough. App: the other person confirms from the notification. App and distance: they must also be near the customer.',
        <Select disabled={off || !s.enabled} style={{ width: 230 }} value={s.confirm} onChange={(v) => set('confirm', v)}
          options={[{ value: 'none', label: 'No confirmation' }, { value: 'app', label: 'Confirm in the app' }, { value: 'app_distance', label: 'Confirm in the app and be near' }]} />)}
      {row('One-time code', 'Also ask the other person for a code made by the server (valid about 10 minutes, 3 tries).',
        <Switch disabled={off || !s.enabled} checked={s.otp} onChange={(v) => set('otp', v)} />)}
      {row('Too far away', 'What happens when someone confirms from farther than the distance below.',
        <span><Select disabled={off || !s.enabled || s.confirm !== 'app_distance'} style={{ width: 200 }} value={s.distance_rule} onChange={(v) => set('distance_rule', v)}
          options={[{ value: 'allow', label: 'Start the visit' }, { value: 'flag', label: 'Start it, flagged' }, { value: 'block', label: 'Block it' }]} />{' '}
          <InputNumber disabled={off || !s.enabled || s.confirm !== 'app_distance'} min={20} max={5000} value={s.distance_meters} suffix="m"
            onChange={(v) => v != null && set('distance_meters', v)} /></span>)}
      {row('People on one visit', 'The most people that can join one joint call.',
        <InputNumber disabled={off || !s.enabled} min={2} max={10} value={s.max_people} onChange={(v) => v != null && set('max_people', v)} />)}
      {row('Close at end of day', 'A joint visit still open at the end of the day is closed for the people on it.',
        <Switch disabled={off || !s.enabled} checked={s.auto_close} onChange={(v) => set('auto_close', v)} />)}
      <div className="muted" style={{ marginTop: 8 }}>Anyone in the reporting line can invite anyone. People on an older app cannot be invited.</div>
      {admin && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Button type="primary" loading={busy || q.isPending} disabled={!dirty} onClick={() => void save()}>Save for the company</Button>
          <Button disabled={busy} onClick={() => setS(JOINT_DEFAULTS)}>Standard settings</Button>
        </div>
      )}
    </div>
  );
}
