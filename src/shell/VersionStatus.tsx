import { useEffect, useState } from 'react';
import { Button } from 'antd';
import { CheckCircleFilled, CloudDownloadOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { playBell } from '../ui/bell';
import { atCheckTimes } from './updateTimes';
import WhatsNew from './WhatsNew';
import { isUnread, markSeen, readSeen } from './releaseNotes';

/** Set to true to show the release notes on the sign-in screen again (only if What is new is opened to everyone). */
const SHOW_NOTES_ON_SIGN_IN = false;

type State ={ kind: 'checking' } | { kind: 'latest' } | { kind: 'new'; version: string } | { kind: 'unknown' };

/** The app's version and whether it is up to date; a newer version can be installed from here (works before sign-in). */
export default function VersionStatus() {
  const { api } = useSession();
  const [version, setVersion] = useState('');
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notes, setNotes] = useState(false);
  const [unread, setUnread] = useState(() => isUnread(readSeen()));

  useEffect(() => {
    let alive = true;
    let told = '';
    api.appVersion().then((v) => { if (alive) setVersion(v); }).catch(() => { /* shown as unknown */ });
    // looked at again at 10, 12, 2 and 4 o'clock while the sign-in screen stays open; a bell rings once for each new version
    const check = () => api.checkUpdate()
      .then((u) => {
        if (!alive) return;
        setState(u ? { kind: 'new', version: u.version } : { kind: 'latest' });
        if (u && told !== u.version) { told = u.version; playBell(); }
      })
      .catch(() => { if (alive) setState((s) => (s.kind === 'checking' ? { kind: 'unknown' } : s)); });
    void check();
    const stop = atCheckTimes(() => void check());
    return () => { alive = false; stop(); };
  }, [api]);

  const install = async () => {
    setBusy(true); setProblem(null);
    try { await api.installUpdate(); } catch (e) {
      const d = describeError(asAppError(e));
      setProblem(d.text || d.title);
      setBusy(false);
    }
  };

  return (
    <div className="version-box" role="status" aria-live="polite">
      {/* the provider decides who sees What is new, and nobody is signed in here yet, so this screen shows the version only */}
      {SHOW_NOTES_ON_SIGN_IN ? (
        <>
          <button type="button" className="ver" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 0, color: 'inherit', font: 'inherit' }}
            title="What is new in this version" onClick={() => { setNotes(true); markSeen(); setUnread(false); }}>
            Version {version || '…'}{unread && <span className="ask-badge" style={{ minWidth: 8, height: 8, padding: 0, marginLeft: 6, verticalAlign: 'middle' }} aria-label="New notes" />}
          </button>
          <WhatsNew open={notes} onClose={() => setNotes(false)} />
        </>
      ) : <span className="ver">Version {version || '…'}</span>}
      {state.kind === 'checking' && <span className="state wait"><LoadingOutlined /> Checking for updates</span>}
      {state.kind === 'latest' && <span className="state ok"><CheckCircleFilled /> Up to date</span>}
      {state.kind === 'unknown' && <span className="state wait"><WarningOutlined /> Could not check for updates</span>}
      {state.kind === 'new' && (
        <>
          <span className="state new"><CloudDownloadOutlined /> Version {state.version} available</span>
          <Button type="primary" size="small" loading={busy} onClick={() => void install()}>Update</Button>
        </>
      )}
      {problem && <span className="problem">The update could not be installed: {problem}</span>}
    </div>
  );
}
