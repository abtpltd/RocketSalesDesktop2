import { useEffect, useState } from 'react';
import { App as AntApp, Alert, Button, Input, InputNumber, Select, Switch } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../api/messages';
import type { AssistantSettings } from '../api/types';
import { asAppError, useSession } from '../session';
import { ASSISTANT_DEFAULTS, useAssistantSettings } from './useAssistant';
import { readJson, writeJson } from '../ui/prefsMath';
import { missedKey, missedText, okMissed, removeMissed, sortMissed, type Missed } from './unanswered';

/** Company settings for the Ask assistant. Everyone with the page open sees them; only an administrator can change them. */
export default function AssistantAdmin({ admin }: { admin: boolean }) {
  const { api, state } = useSession();
  const company = state.status === 'in' ? state.info.company.domain : '';
  const [missed, setMissed] = useState<Missed[]>(() => readJson<Missed[]>(missedKey(company), [], okMissed));
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const { settings, loading } = useAssistantSettings();
  const [s, setS] = useState<AssistantSettings>(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setS(settings); }, [settings]);
  const set = <K extends keyof AssistantSettings>(k: K, v: AssistantSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const problem = s.lo > s.hi ? 'The red limit cannot be above the amber limit.' : s.stale_days > s.bad_days ? 'The amber days cannot be more than the red days.'
    : !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.late) ? 'The late-start time must look like 09:30.' : '';
  const save = async () => {
    setBusy(true);
    try {
      const { message: done, ...saved } = await api.saveAssistant(s);
      await qc.invalidateQueries({ queryKey: ['assistant-settings'] });
      setS(saved as AssistantSettings);
      void message.success(done || 'Assistant settings saved');
    } catch (e) {
      const d = describeError(asAppError(e));
      void message.error(asAppError(e).code === 'not_found' ? 'Your server does not have these settings yet. Ask your developer to update the server first.' : `${d.title}. ${d.text}`);
    } finally { setBusy(false); }
  };
  const row = (label: string, hint: string, body: React.ReactNode) => (
    <div className="aa-row"><div><b>{label}</b><div className="muted">{hint}</div></div><div>{body}</div></div>
  );
  return (
    <div className="aa">
      {!admin && <Alert type="info" showIcon style={{ marginBottom: 10 }} title="Only your company administrator can change these." />}
      {row('RocketPilot AI', 'Switch the assistant on or off for the whole company.', <Switch disabled={!admin} checked={s.enabled} onChange={(v) => set('enabled', v)} />)}
      {row('Roles that can use it', 'Leave empty to allow every role.', <Select mode="tags" disabled={!admin} style={{ width: 300 }} value={s.roles} onChange={(v) => set('roles', v)} tokenSeparators={[',']} placeholder="All roles" />)}
      {row('Pinned questions', 'Shown first in every user\'s RocketPilot AI panel. Up to 12.', <Select mode="tags" disabled={!admin} style={{ width: 300 }} maxCount={12} value={s.pinned} onChange={(v) => set('pinned', v.map((x) => x.slice(0, 120)))} placeholder="Type a question, press Enter" open={false} />)}
      {row('Red below / amber below', 'Share of target for visits and sales. Also the starting colours of the report rows.', (
        <span><InputNumber disabled={!admin} min={1} max={199} value={s.lo} suffix="%" onChange={(v) => v != null && set('lo', v)} /> <InputNumber disabled={!admin} min={1} max={200} value={s.hi} suffix="%" onChange={(v) => v != null && set('hi', v)} /></span>
      ))}
      {row('Late start after', 'A start of day later than this counts as late (24-hour, like 09:30).', <Input disabled={!admin} style={{ width: 90 }} value={s.late} onChange={(e) => set('late', e.target.value)} />)}
      {row('Customers not visited', 'Amber after this many days, red after the second number.', (
        <span><InputNumber disabled={!admin} min={1} max={365} value={s.stale_days} suffix="days" onChange={(v) => v != null && set('stale_days', v)} /> <InputNumber disabled={!admin} min={1} max={730} value={s.bad_days} suffix="days" onChange={(v) => v != null && set('bad_days', v)} /></span>
      ))}
      {row('Stock expiring', 'Flag stock that expires within this many months.', <InputNumber disabled={!admin} min={1} max={24} value={s.expiry_months} suffix="months" onChange={(v) => v != null && set('expiry_months', v)} />)}
      {row('Morning summary', 'Shows "Needs attention today" on the dashboard.', <Switch disabled={!admin} checked={s.morning_summary} onChange={(v) => set('morning_summary', v)} />)}
      {row('Voice input', 'A microphone button in the RocketPilot AI panel. Uses the computer\'s own speech recognition, which may need internet.', <Switch disabled={!admin} checked={s.voice} onChange={(v) => set('voice', v)} />)}
      {row('AI answers', 'Off. The assistant works from saved reports with fixed rules, so it costs nothing and sends no data out.', <Select disabled style={{ width: 120 }} value="off" options={[{ value: 'off', label: 'Off' }]} />)}
      {problem && <Alert type="warning" showIcon style={{ marginTop: 10 }} title={problem} />}
      {admin && (
        <div className="aa-missed">
          <b>Questions it could not answer on this computer ({missed.length})</b>
          <div className="muted">Kept on this computer only. The most asked ones are the answer types worth adding next.</div>
          {missed.length === 0 ? <div className="muted" style={{ marginTop: 6 }}>None yet.</div> : (
            <>
              {sortMissed(missed).slice(0, 30).map((m) => (
                <div key={m.key} className="aa-m"><span className="aa-n">{m.count}×</span><span>{m.q}</span>
                  <a onClick={() => { const n = removeMissed(missed, m.key); setMissed(n); writeJson(missedKey(company), n); }}>remove</a></div>
              ))}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <Button size="small" onClick={() => { void navigator.clipboard?.writeText(missedText(missed)).then(() => message.success('List copied'), () => message.error('Could not copy')); }}>Copy list</Button>
                <Button size="small" danger onClick={() => { setMissed([]); writeJson(missedKey(company), []); }}>Clear list</Button>
              </div>
            </>
          )}
        </div>
      )}
      {admin && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <Button type="primary" loading={busy || loading} disabled={!dirty || !!problem} onClick={() => void save()}>Save for the company</Button>
          <Button disabled={busy} onClick={() => setS(ASSISTANT_DEFAULTS)}>Standard settings</Button>
        </div>
      )}
    </div>
  );
}
