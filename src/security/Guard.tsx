import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Input } from 'antd';
import { useSession } from '../session';
import AppLogo from '../ui/AppLogo';
import { currentQuote } from '../ui/dailyQuote';
import type { SessionInfo } from '../api/types';
import {
  CLIPBOARD_CLEAR_SECONDS, SCAN_EVERY_MS, graceLeft, isBlockedKey, names, offlineTooLong, shouldLock, type Finding,
} from './guardLogic';

const cover: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 100000, background: '#0f1b2d', color: '#fff', display: 'flex',
  flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 32,
};

/** Wraps the signed-in app: hides the screen when a recorder or remote tool is running, locks when idle,
 *  clears the clipboard after copying and blocks copy and print for roles the provider chose. */
export default function Guard({ info, children }: { info: SessionInfo; children: ReactNode }) {
  const { api, login, signOut, offline } = useSession();
  const [found, setFound] = useState<Finding[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [locked, setLocked] = useState(false);
  const last = useRef(Date.now());
  const offlineSince = useRef(0);
  const reported = useRef(false);
  const support = useRef(false);
  const supportAt = useRef(0);
  const blocked = !!info.user.copy_blocked;
  const share = !!info.user.share_allowed;
  // hidden from capture and meeting screen-sharing, unless the provider allowed sharing for this person now
  useEffect(() => {
    void api.setProtected(!share).catch(() => {});
    return () => { void api.setProtected(true).catch(() => {}); };
  }, [api, share]);

  // programs that can record or remote-control the screen
  useEffect(() => {
    let stop = false;
    const scan = async () => {
      try {
        const r = await api.guardScan();
        if (stop) return;
        if (r.findings.length === 0) { reported.current = false; support.current = false; setFound([]); setStartedAt(0); return; }
        if (support.current && Date.now() - supportAt.current > 300_000) reported.current = false; // ask again: the session may have ended
        if (!reported.current) {
          reported.current = true; supportAt.current = Date.now();
          // the server says whether the provider switched remote support on for a support session
          const res = await api.guardReport('detected', names(r.findings), Array.from(new Set(r.findings.map((x) => x.kind)))).catch(() => ({} as { support?: boolean }));
          support.current = !!res.support && r.findings.every((x) => x.kind === 'remote');
        }
        if (stop) return;
        if (support.current) { setFound([]); setStartedAt(0); return; }
        setFound(r.findings);
        setStartedAt((s) => s || Date.now());
      } catch { /* a failed look is not a finding */ }
    };
    void scan();
    const t = setInterval(scan, SCAN_EVERY_MS);
    return () => { stop = true; clearInterval(t); };
  }, [api]);

  // grace time, then sign out and switch this computer off
  useEffect(() => {
    if (!found.length) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [found.length]);
  const left = found.length && startedAt ? graceLeft(startedAt, tick) : 30;
  const done = useRef(false);
  useEffect(() => {
    if (found.length && startedAt && left === 0 && !done.current) {
      done.current = true;
      void (async () => {
        try { await api.guardReport('switch_off', names(found), Array.from(new Set(found.map((x) => x.kind)))); } finally { await signOut(); }
      })();
    }
  }, [found, startedAt, left, api, signOut]);

  // idle lock
  useEffect(() => {
    const touch = () => { last.current = Date.now(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = setInterval(() => {
      const now = Date.now();
      if (offline && !offlineSince.current) offlineSince.current = now;
      if (!offline) offlineSince.current = 0;
      if (shouldLock(now, last.current, offline, !!document.fullscreenElement) || offlineTooLong(now, offlineSince.current)) setLocked(true);
    }, 5000);
    return () => { events.forEach((e) => window.removeEventListener(e, touch)); clearInterval(t); };
  }, [offline]);

  // clipboard: cleared a minute after copying; and no copy or print for blocked roles
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onCopy = (e: ClipboardEvent) => {
      if (blocked) { e.preventDefault(); return; }
      clearTimeout(timer);
      timer = setTimeout(() => { void navigator.clipboard?.writeText(' ').catch(() => {}); }, CLIPBOARD_CLEAR_SECONDS * 1000);
    };
    const stopIt = (e: Event) => { if (blocked) e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if (!blocked || !isBlockedKey(e)) return;
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (e.key.toLowerCase() === 'printscreen') { void navigator.clipboard?.writeText(' ').catch(() => {}); e.preventDefault(); return; }
      if (!typing || e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 's') e.preventDefault();
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('contextmenu', stopIt);
    document.addEventListener('dragstart', stopIt);
    window.addEventListener('keydown', onKey, true);
    document.documentElement.classList.toggle('no-copy', blocked);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('contextmenu', stopIt);
      document.removeEventListener('dragstart', stopIt);
      window.removeEventListener('keydown', onKey, true);
      document.documentElement.classList.remove('no-copy');
    };
  }, [blocked]);

  const clearClipboard = useCallback(() => { void navigator.clipboard?.writeText(' ').catch(() => {}); }, []);
  useEffect(() => { if (locked) clearClipboard(); }, [locked, clearClipboard]);

  const covered = found.length > 0;
  return (
    <>
      <div aria-hidden={locked || covered} style={locked || covered ? { visibility: 'hidden' } : undefined}>{children}</div>
      {covered && (
        <div style={cover} role="alert" data-testid="guard-cover">
          <h2 style={{ color: '#fff' }}>Screen hidden</h2>
          <p style={{ maxWidth: 520 }}>
            {names(found).join(', ')} {found.length === 1 ? 'is' : 'are'} running and could record or share this screen.
            Please close {found.length === 1 ? 'it' : 'them'}. Your administrator has been told.
          </p>
          <p>If {found.length === 1 ? 'it is' : 'they are'} still running in <b>{left}</b> seconds you will be signed out and this computer switched off.</p>
        </div>
      )}
      {locked && !covered && <LockScreen info={info} offline={offline} login={login} signOut={signOut} onUnlock={() => { last.current = Date.now(); offlineSince.current = 0; setLocked(false); }} />}
    </>
  );
}

function LockScreen({ info, offline, login, signOut, onUnlock }: {
  info: SessionInfo; offline: boolean; login: (c: string, e: string, p: string) => Promise<void>; signOut: () => Promise<void>; onUnlock: () => void;
}) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    setBusy(true); setMsg('');
    try { await login(info.company.domain, info.user.email, pw); setPw(''); onUnlock(); }
    catch { setMsg(offline ? 'Connect to the internet to unlock, or sign out.' : 'That password did not work.'); }
    finally { setBusy(false); }
  };
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 15_000); return () => window.clearInterval(t); }, []);
  const quote = useRef(currentQuote()).current;
  return (
    <div className="lock-screen" data-testid="lock-screen">
      <div className="lock-sparks" aria-hidden>{Array.from({ length: 22 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, width: 2 + (i % 4), height: 2 + (i % 4), animationDuration: `${5 + (i * 7) % 8}s`, animationDelay: `-${(i * 3) % 10}s` }} />))}</div>
      {[1, 2, 3].map((n) => (
        <div key={n} className={`lock-wave w${n}`} aria-hidden><svg viewBox="0 0 1200 100" preserveAspectRatio="none">
          <path d={n === 2 ? 'M0 55 Q150 100 300 55 T600 55 T900 55 T1200 55 V100 H0Z' : 'M0 50 Q150 0 300 50 T600 50 T900 50 T1200 50 V100 H0Z'} /></svg></div>))}
      <div className="lock-body">
        <AppLogo className="lock-logo" title="" />
        <div className="lock-clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
        <div className="lock-date">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="lock-note">Locked after a quiet spell. Enter the password for {info.user.email}.</div>
        <Input.Password autoFocus className="lock-input" value={pw} onChange={(e) => setPw(e.target.value)} onPressEnter={unlock} placeholder="Password" />
        {msg && <div className="lock-msg" role="alert">{msg}</div>}
        <Button className="lock-unlock" loading={busy} onClick={unlock} disabled={!pw}>Unlock</Button>
        <button type="button" className="lock-out" onClick={() => void signOut()}>Sign out</button>
        {quote && <div className="lock-quote"><div>“{quote.text}”</div><small>{quote.author} · Quote of the day</small></div>}
      </div>
      <div className="lock-foot">RocketSales · Pharma AI Powered SFA Solution</div>
    </div>
  );
}
