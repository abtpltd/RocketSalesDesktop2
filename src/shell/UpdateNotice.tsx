import { useEffect, useRef, useState } from 'react';
import { Alert, Button } from 'antd';
import { CloudDownloadOutlined } from '@ant-design/icons';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { playBell } from '../ui/bell';
import { atCheckTimes } from './updateTimes';
import { canSeeWhatsNew } from './releaseNotes';

/** Release notes as short lines: one per line, a leading dash or bullet removed. */
export const noteLines = (notes?: string | null): string[] =>
  (notes ?? '').split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 12);

/** Shows a bar when a newer signed version is published; installing restarts the app (the saved copy stays). */
export default function UpdateNotice() {
  const { api, state } = useSession();
  // the release notes inside the update bar and the Windows notification are "What is new" too: only for people the provider switched it on for
  const showNotes = state.status === 'in' && canSeeWhatsNew(state.info.user);
  const showNotesRef = useRef(showNotes);
  showNotesRef.current = showNotes;
  const [update, setUpdate] = useState<{ version: string; notes?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    let told = '';
    const check = () => api.checkUpdate().then((u) => {
      if (!alive) return;
      setUpdate(u);
      if (u && told !== u.version) {
        told = u.version; playBell(); setHidden(false); // ring once for each new version, and show the bar again if it was closed
        try { // when the window is behind others or minimised, also tell Windows
          if (!document.hasFocus() && 'Notification' in window) {
            const show = () => new Notification('RocketSales update ready', { body: `Version ${u.version} is ready.${(showNotesRef.current ? noteLines(u.notes) : []).slice(0, 3).map((l) => `\n- ${l}`).join('')}\nOpen RocketSales to install it.` });
            if (Notification.permission === 'granted') show();
            else if (Notification.permission === 'default') void Notification.requestPermission().then((p) => { if (p === 'granted') show(); });
          }
        } catch { /* notifications not available: the bell and the bar still show */ }
      }
    }).catch(() => { /* offline or no update site */ });
    check();
    const stop = atCheckTimes(check); // and again at 10, 12, 2 and 4 o'clock while the app stays open
    const every = setInterval(check, 30 * 60_000); // and every half hour, so a new version is heard about soon after it is published
    const back = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', back); // and when the window is brought back
    return () => { alive = false; stop(); clearInterval(every); document.removeEventListener('visibilitychange', back); };
  }, [api]);

  if (!update || hidden) return null;
  const install = async () => {
    setBusy(true); setProblem(null);
    try { await api.installUpdate(); } catch (e) {
      const d = describeError(asAppError(e));
      setProblem(d.text || d.title);
      setBusy(false);
    }
  };
  return (
    <Alert type={problem ? 'error' : 'info'} showIcon icon={<CloudDownloadOutlined />} closable onClose={() => setHidden(true)}
      style={{ marginBottom: 14 }}
      title={problem ? `The update could not be installed: ${problem}` : `Version ${update.version} is ready`}
      description={problem ? undefined : (
        <div>
          {showNotes && <div><b>What is new</b></div>}
          {showNotes && noteLines(update.notes).length ? <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>{noteLines(update.notes).map((l) => <li key={l}>{l}</li>)}</ul> : 'Install it now; the app restarts in a few seconds and keeps you signed in.'}
        </div>
      )}
      action={<Button type="primary" size="small" loading={busy} onClick={() => void install()}>Update and restart</Button>} />
  );
}
