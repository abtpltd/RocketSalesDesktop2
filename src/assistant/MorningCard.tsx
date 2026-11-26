import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from 'antd';
import { useOwnerKey } from '../ui/GridPrefs';
import { readJson, writeJson } from '../ui/prefsMath';
import { openAsk } from './bus';
import PilotAvatar, { usePilotOn, usePoke } from './PilotAvatar';
import { SAYS } from './pilotMood';
import { topAsked, okCounts, type Counts } from './asked';
import { dueReminders, okReminders, removeReminder, type Reminder } from './reminders';
import { facts, freshness, type Fact } from './skills';
import { useAssistantSettings, useLoader } from './useAssistant';

/** On the dashboard: what needs attention today, worked out from the saved reports. Shown only when there is something. */
export default function MorningCard() {
  const { settings, allowed } = useAssistantSettings();
  const load = useLoader();
  const remKey = useOwnerKey('ask', 'reminders');
  const countKey = useOwnerKey('ask', 'counts');
  const [items, setItems] = useState<Fact[] | null>(null);
  const [old, setOld] = useState<string[]>([]);
  const [rems, setRems] = useState<Reminder[]>(() => readJson<Reminder[]>(remKey, [], okReminders));
  const top = topAsked(readJson<Counts>(countKey, {}, okCounts), [], 3);
  useEffect(() => {
    if (!allowed || !settings.morning_summary) { setItems(null); return; }
    let live = true;
    const today = new Date();
    void facts({ q: '', toks: [], mods: {}, s: settings, today, load }).then((f) => { if (live) setItems(f); }).catch(() => { if (live) setItems(null); });
    void freshness(load, today).then((r) => { if (live) setOld(r.saved.filter((x) => x.days > 3).map((x) => `${x.label} (${x.days} days)`)); }).catch(() => { if (live) setOld([]); });
    return () => { live = false; };
  }, [allowed, settings, load]);
  const done = useCallback((id: number) => setRems((r) => { const n = removeReminder(r, id); writeJson(remKey, n); return n; }), [remKey]);
  const [pilotOn] = usePilotOn();
  const poke = usePoke(items?.some((f) => f.tone === 'bad') ? 'alert' : 'greet');
  const due = dueReminders(rems, new Date());
  if (!allowed || !settings.morning_summary) return null;
  if (!items?.length && !due.length && !old.length) return null;
  return (
    <Card size="small" className="ask-card" title={`Needs attention today (${(items?.length ?? 0) + due.length})`}
      extra={<Button size="small" type="primary" ghost onClick={() => openAsk('What needs attention today?')}>Open RocketPilot AI</Button>}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      {due.map((r) => (
        <div key={r.id} className="ask-rem ask-warn"><span>Reminder: {r.text}{r.due ? ` (${r.due})` : ''}</span><a onClick={() => done(r.id)}>Done</a></div>
      ))}
      {items?.map((f) => (
        <div key={f.id} className={`ask-line ask-${f.tone}`}><a onClick={() => openAsk(f.question)}>{f.label}</a></div>
      ))}
      {old.length > 0 && <div className="ask-line ask-warn"><a onClick={() => openAsk('How fresh is my data?')}>Saved copies are getting old: {old.join(', ')}</a></div>}
      </div>
      {pilotOn && <div style={{ textAlign: 'center' }}><PilotAvatar mood={poke.mood} height={112} onPoke={poke.poke} />{poke.poked && <div className="muted" style={{ fontSize: 12, maxWidth: 130 }}>{SAYS[poke.mood]}</div>}</div>}
      </div>
      {top.length > 0 && <div className="ask-note">Often asked: {top.map((q, i) => <span key={q}>{i ? ' · ' : ''}<a onClick={() => openAsk(q)}>{q}</a></span>)}</div>}
      <div className="ask-note">Counted over everything saved on this computer (not only today). No server call.</div>
    </Card>
  );
}
