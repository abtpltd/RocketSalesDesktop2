import { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntApp, Button, Drawer, Input, Segmented, Select, Spin, Tag, Tooltip } from 'antd';
import { AudioOutlined, CopyOutlined, PrinterOutlined, PlusOutlined, SendOutlined, StarFilled } from '@ant-design/icons';
import { useDrill } from '../drill';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { useOwnerKey } from '../ui/GridPrefs';
import { readJson, writeJson } from '../ui/prefsMath';
import ExportButton from '../ui/ExportButton';
import { ask } from './engine';
import { bump, okCounts, topAsked, type Counts } from './asked';
import { addReminder, okReminders, parseReminder, sortedReminders, wantsReminders, type Reminder } from './reminders';
import { printAnswer } from './print';
import PilotAvatar, { usePilotOn, usePoke } from './PilotAvatar';
import { SAYS, answerMood, speakMs, type Mood } from './pilotMood';
import { onOpenAsk } from './bus';
import { addMissed, missedKey, okMissed, type Missed } from './unanswered';
import { useAssistantSettings, useLoader } from './useAssistant';
import type { Action, Answer, Copy, Ctx, Loader } from './types';
import type { Tone } from '../ui/rowTone';

interface Msg { id: number; q: string; a?: Answer; showAll?: boolean; area?: string; rep?: string }
type Mode = 'side' | 'half' | 'full';
const MODES: Mode[] = ['side', 'half', 'full'];
const MONTHLY = new Set(['target_vs_sales', 'target_itemized', 'monthly_visit_summary']);
const toneClass = (t?: Tone) => (t ? `ask-${t}` : '');

type SpeechCtor = new () => { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: () => void; onend: () => void; start: () => void };
const speech = (): SpeechCtor | null => { const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }; return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null; };

/** The Ask panel: type a question, get an answer worked out from the reports saved on this computer. Read-only. */
export default function AskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api, state } = useSession();
  const { message } = AntApp.useApp();
  const { drill } = useDrill();
  const { settings, allowed } = useAssistantSettings();
  const company = state.status === 'in' ? state.info.company.domain : '';
  const load = useLoader();
  const historyKey = useOwnerKey('ask', 'history');
  const modeKey = useOwnerKey('ask', 'mode');
  const remKey = useOwnerKey('ask', 'reminders');
  const countKey = useOwnerKey('ask', 'counts');
  const [counts, setCounts] = useState<Counts>(() => readJson<Counts>(countKey, {}, okCounts));
  const [mode, setModeState] = useState<Mode>(() => readJson<Mode>(modeKey, 'side', (v) => MODES.includes(v as Mode)));
  const setMode = (m: Mode) => { setModeState(m); writeJson(modeKey, m); };
  const wide = mode !== 'side';
  /** the full view leaves the menu on the left as it is now (open or collapsed) */
  const menuWidth = mode === 'full' ? Math.round(document.querySelector('aside')?.getBoundingClientRect().width ?? 256) : 0;
  const drawerSize = mode === 'side' ? 480 : mode === 'half' ? '50vw' : `calc(100vw - ${menuWidth}px)`;
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(historyKey, [], (v) => Array.isArray(v)));
  const ctx = useRef<Ctx | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const n = useRef(0);
  const [tick, setTick] = useState(0);
  const [pilotOn, setPilotOn] = usePilotOn();
  const [mood, setMood] = useState<Mood>('greet');
  const poke = usePoke(mood);
  useEffect(() => { if (!open) return; setMood('greet'); const t = setTimeout(() => setMood('idle'), 3500); return () => clearTimeout(t); }, [open]);
  useEffect(() => {
    if (busy) { setMood('think'); return; }
    const a = msgs[msgs.length - 1]?.a;
    if (!a) return;
    setMood('speak');
    const t = setTimeout(() => setMood(answerMood(a)), speakMs(a.text));
    return () => clearTimeout(t);
  }, [busy, msgs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);

  /** "remind me to ..." and "my reminders": kept on this computer, no server call */
  const reminderAnswer = useCallback(async (q: string): Promise<Answer | null> => {
    const list = readJson<Reminder[]>(remKey, [], okReminders);
    const r = parseReminder(q, new Date());
    if (r) {
      writeJson(remKey, addReminder(list, r.text, r.due));
      return { text: `Reminder saved${r.due ? ` for ${r.due}` : ''}: ${r.text}`, actions: [], notes: ['It shows on the dashboard card when due. Kept on this computer only.'], copy: '' };
    }
    if (wantsReminders(q)) {
      const all = sortedReminders(list).filter((x) => !x.done);
      return { text: all.length ? `${all.length} reminder${all.length === 1 ? '' : 's'}:` : 'You have no reminders. Say "Remind me to chase Lakeview on Friday".', lines: all.map((x) => ({ text: `${x.due || 'no date'}: ${x.text}` })), actions: [], notes: [], copy: '' };
    }
    return null;
  }, [remKey]);
  const run = useCallback(async (question: string, replace?: number, extra?: { report: string; copy: Copy }) => {
    const q = question.trim();
    if (!q || busy) return;
    const id = replace ?? ++n.current;
    setBusy(true);
    if (replace == null) setMsgs((m) => [...m, { id, q }]);
    try {
      // a report just fetched is used even if this role is not allowed to keep offline copies
      const withExtra: Loader = extra ? async (r) => (r === extra.report ? [extra.copy, ...(await load(r))] : load(r)) : load;
      const a = (await reminderAnswer(q)) ?? await ask({ question: q, settings, load: withExtra, ctx: ctx.current });
      ctx.current = a.ctx ?? ctx.current;
      if (a.unknown && company) { const k = missedKey(company); writeJson(k, addMissed(readJson<Missed[]>(k, [], okMissed), q, Math.floor(Date.now() / 1000))); }
      setMsgs((m) => m.map((x) => (x.id === id ? { ...x, a } : x)));
      // remembered only when it was understood, and never a reminder (those are personal)
      if (!a.unknown && !parseReminder(q, new Date()) && !wantsReminders(q)) {
        setCounts((c) => { const n = bump(c, q); writeJson(countKey, n); return n; });
        setRecent((r) => { const next = [q, ...r.filter((x) => x !== q)].slice(0, 12); writeJson(historyKey, next); return next; });
      }
    } catch (e) {
      const d = describeError(asAppError(e));
      setMsgs((m) => m.map((x) => (x.id === id ? { ...x, a: { text: `${d.title}. ${d.text}`, actions: [], notes: [], copy: '' } } : x)));
    } finally { setBusy(false); }
  }, [busy, settings, load, historyKey, company, reminderAnswer, countKey]);

  const send = (q: string) => { setText(''); void run(q); };
  // a question handed over by another screen (the morning card)
  const pending = useRef<string | undefined>(undefined);
  useEffect(() => onOpenAsk((q) => { pending.current = q; setTick((t) => t + 1); }), []);
  useEffect(() => {
    if (open && pending.current) { const q = pending.current; pending.current = undefined; void run(q); }
  }, [open, run, tick]);

  const fetchNow = async (m: Msg, a: Extract<Action, { kind: 'fetch' }>) => {
    setBusy(true);
    try {
      const q = { from: MONTHLY.has(a.report) ? a.from.slice(0, 7) : a.from, to: a.to, size: 500, page: 1 };
      const got = await api.fetchReport(a.report as never, q);
      const p = got.data as { rows?: Copy['rows']; total?: number; from?: string; to?: string };
      setBusy(false);
      await run(m.q, m.id, { report: a.report, copy: { report: a.report, rows: p.rows ?? [], total: p.total ?? (p.rows ?? []).length, from: String(p.from ?? a.from), to: String(p.to ?? a.to), savedAt: got.saved_at } });
      return;
    } catch (e) {
      const d = describeError(asAppError(e));
      void message.error(`${d.title}. ${d.text}`);
      setBusy(false);
      return;
    }
  };
  const act = (m: Msg, a: Action) => {
    if (a.kind === 'open') { drill(a.target); onClose(); }
    else if (a.kind === 'fetch') void fetchNow(m, a);
    else send(a.question);
  };
  const listen = () => {
    const S = speech();
    if (!S) { void message.info('Voice input is not available on this computer.'); return; }
    const r = new S();
    r.lang = navigator.language || 'en-US'; r.interimResults = false;
    r.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) send(t); };
    r.onerror = () => { setListening(false); void message.info('Could not hear that. Try typing.'); };
    r.onend = () => setListening(false);
    setListening(true);
    try { r.start(); } catch { setListening(false); void message.info('Voice input could not start. Try again, or type.'); }
  };

  const builtIn = ['Who is below target this week?', 'Late starters today', `Customers not visited for ${settings.bad_days} days`, 'Products expiring soon', 'What needs attention today?'];
  const pinned = [...settings.pinned, ...builtIn.filter((b) => !settings.pinned.includes(b))];
  const user = state.status === 'in' ? state.info.user.name : '';

  const view = (m: Msg) => {
    const a = m.a;
    if (!a) return <div className="ask-a"><Spin size="small" /> Looking…</div>;
    const t = a.table && { ...a.table, columns: a.table.columns.filter((c) => wide || !c.wide) };
    // wide views show every row, narrowed by the area / rep chosen in the side box
    const all = a.table ? a.table.all.map((r, i) => ({ r, tone: a.table!.allTones[i] })) : [];
    const areas = [...new Set(all.map((x) => String(x.r.area ?? '')).filter(Boolean))].sort();
    const reps = [...new Set(all.map((x) => String(x.r.rep ?? '')).filter(Boolean))].sort();
    const kept = all.filter((x) => (!m.area || String(x.r.area ?? '') === m.area) && (!m.rep || String(x.r.rep ?? '') === m.rep));
    const filtered = wide && (areas.length > 1 || reps.length > 1) ? kept : all;
    const rows = t ? (wide || m.showAll ? filtered.map((x) => x.r) : t.rows) : [];
    const tones = t ? (wide || m.showAll ? filtered.map((x) => x.tone) : t.tones) : [];
    const shown = t ? (wide || m.showAll ? filtered.length : t.rows.length) : 0;
    const setFilter = (k: 'area' | 'rep', v?: string) => setMsgs((x) => x.map((y) => (y.id === m.id ? { ...y, [k]: v } : y)));
    const max = Math.max(1, ...(a.bars ?? []).map((b) => b.value));
    return (
      <div className="ask-a">
        <div>{a.text}</div>
        {t && (
          <div className={`ask-split ${mode === 'full' ? 'full' : ''}`}>
          <div className="ask-scroll">
          <table className={`ask-table ${wide ? 'wide' : ''}`}>
            <thead><tr>{t.columns.map((c) => <th key={c.key} className={c.right ? 'r' : ''}>{c.title}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i} className={toneClass(tones[i])}>{t.columns.map((c) => <td key={c.key} className={c.right ? 'r' : ''}>{String(r[c.key] ?? '')}</td>)}</tr>
            ))}</tbody>
          </table>
          </div>
          {mode === 'full' && (
            <div className="ask-side">
              <b>Filter this answer</b>
              {areas.length > 1 && <Select allowClear showSearch size="small" placeholder="Area" value={m.area} options={areas.map((v) => ({ value: v, label: v }))} onChange={(v) => setFilter('area', v)} />}
              {reps.length > 1 && <Select allowClear showSearch size="small" placeholder="Rep" value={m.rep} options={reps.map((v) => ({ value: v, label: v }))} onChange={(v) => setFilter('rep', v)} />}
              <div className="muted">Showing {shown} of {all.length}</div>
              <b>Actions</b>
              {a.actions.filter((x) => x.kind === 'open').map((x) => <a key={x.label} onClick={() => act(m, x)}>{x.label}</a>)}
            </div>
          )}
          </div>
        )}
        {t && !wide && t.more > 0 && !m.showAll && <Button size="small" type="link" onClick={() => setMsgs((x) => x.map((y) => (y.id === m.id ? { ...y, showAll: true } : y)))}>Show all {t.all.length}</Button>}
        {a.bars && (
          <div className="ask-bars">{a.bars.map((b) => (
            <div key={b.label}><span className="ask-bl">{b.label}</span>
              <i className={toneClass(b.tone)} style={{ width: `${Math.max(4, (b.value / max) * 130)}px` }} /><span className="muted">{b.shown}</span></div>
          ))}</div>
        )}
        {a.lines?.map((l, i) => (
          <div key={i} className={`ask-line ${toneClass(l.tone)}`}>
            {l.question ? <a onClick={() => send(l.question!)}>{l.text}</a> : l.text}
          </div>
        ))}
        {a.notes.map((x) => <div key={x} className="ask-note">{x}</div>)}
        <div className="ask-actions">
          {a.actions.map((x) => <Button key={x.label} size="small" type={x.kind === 'open' || x.kind === 'fetch' ? 'primary' : 'default'} ghost={x.kind !== 'open'} disabled={busy} onClick={() => act(m, x)}>{x.label}</Button>)}
          {t && (
            <ExportButton name={`Ask ${new Date().toISOString().slice(0, 10)}`} sheet="Answer" load={async () => ({ columns: t.columns, rows: filtered.map((x) => x.r) })} />
          )}
          {(t || a.lines?.length) && <Tooltip title="Print or save as PDF"><Button size="small" icon={<PrinterOutlined />} aria-label="Print answer"
            onClick={() => { if (!printAnswer(a, t ? filtered.map((x) => x.r) : undefined)) void message.error('Could not open the print window.'); }} /></Tooltip>}
          {a.copy && <Tooltip title="Copy as text"><Button size="small" icon={<CopyOutlined />} aria-label="Copy answer"
            onClick={() => { void navigator.clipboard?.writeText(a.copy).then(() => message.success('Copied'), () => message.error('Could not copy')); }} /></Tooltip>}
        </div>
        {a.source && <div className="ask-source"><Tag color="green" variant="filled">Saved copy · no server call</Tag>{a.source}</div>}
      </div>
    );
  };

  return (
    <Drawer open={open} onClose={onClose} size={drawerSize as number} title={<span><StarFilled style={{ color: 'var(--brand)' }} /> RocketPilot AI</span>}
      extra={<span style={{ display: 'flex', gap: 8 }}><Segmented size="small" value={mode} onChange={(v) => setMode(v as Mode)} options={[{ value: 'side', label: 'Side' }, { value: 'half', label: 'Half' }, { value: 'full', label: 'Full' }]} aria-label="Panel size" /><Button size="small" icon={<PlusOutlined />} disabled={!msgs.length} onClick={() => { setMsgs([]); ctx.current = null; }}>New</Button></span>}
      styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0 } }}>
      {!allowed ? (
        <div style={{ padding: 20 }} className="muted">RocketPilot AI is switched off for {state.status === 'in' && settings.roles.length ? 'your role' : 'your company'}. Your administrator can change this in App settings.</div>
      ) : (
        <>
          {pilotOn && (
            <div className="pilot-banner">
              <PilotAvatar mood={poke.mood} height={mode === 'side' ? 104 : 128} onPoke={poke.poke} />
              <div className="pilot-say"><a onClick={() => setPilotOn(false)}>Hide</a>{poke.mood === 'greet' && user ? `Hello ${user.split(' ')[0]}! How can I help today?` : SAYS[poke.mood]}</div>
            </div>
          )}
          <div className="ask-scope"><Tag color="green" variant="filled">Read-only</Tag><Tag variant="filled">Answers come from reports saved on this computer</Tag></div>
          <div className="ask-body">
            {!msgs.length && (
              <>
                <div className="ask-h">{user ? `Hello ${user.split(' ')[0]}. ` : ''}Ask about visits, attendance, customers, stock or sales</div>
                <div className="ask-h2">Pinned</div>
                {pinned.map((p) => <button type="button" key={p} className="ask-sug" onClick={() => send(p)}>{p}</button>)}
                {topAsked(counts, pinned).length > 0 && <><div className="ask-h2">Most asked</div>{topAsked(counts, pinned).map((p) => <button type="button" key={p} className="ask-sug" onClick={() => send(p)}>{p}</button>)}</>}
                {recent.length > 0 && <><div className="ask-h2">Recent</div>{recent.map((p) => (
                  <div key={p} className="ask-recent-row">
                    <button type="button" className="ask-sug ask-recent" onClick={() => send(p)}>{p}</button>
                    <button type="button" className="ask-x" aria-label={`Forget ${p}`} title="Remove from Recent and Most asked"
                      onClick={() => { setRecent((r) => { const n = r.filter((x) => x !== p); writeJson(historyKey, n); return n; }); setCounts((c) => { const n = { ...c }; delete n[p]; writeJson(countKey, n); return n; }); }}>×</button>
                  </div>
                ))}</>}
              </>
            )}
            {msgs.map((m) => (
              <div key={m.id}><div className="ask-q">{m.q}</div>{view(m)}</div>
            ))}
            {busy && msgs.length > 0 && msgs[msgs.length - 1].a && <div className="ask-note"><Spin size="small" /> Working…</div>}
            <div ref={end} />
          </div>
          <div className="ask-input">
            <Input value={text} onChange={(e) => setText(e.target.value)} onPressEnter={() => send(text)} maxLength={300} autoFocus
              placeholder="Ask about sales, visits, customers…" suffix={settings.voice && speech() ? <Button type="text" size="small" icon={<AudioOutlined style={{ color: listening ? 'var(--bad)' : undefined }} />} onClick={listen} aria-label="Speak" /> : null} />
            <Button type="primary" icon={<SendOutlined />} disabled={!text.trim() || busy} onClick={() => send(text)} aria-label="Send" />
          </div>
          <div className="ask-foot muted">{!pilotOn && <a onClick={() => setPilotOn(true)}>Show RocketPilot's picture. </a>}It cannot change any data. Colours use your company's limits ({settings.lo}% and {settings.hi}% of target).</div>
        </>
      )}
    </Drawer>
  );
}
