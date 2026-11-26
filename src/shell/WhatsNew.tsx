import { useEffect, useState } from 'react';
import { Button, Modal, Tag } from 'antd';
import { useSession } from '../session';
import PilotAvatar, { usePoke } from '../assistant/PilotAvatar';
import { RELEASES } from './releaseNotes';

const COLORS = ['#ffd43b', '#ff6b6b', '#63e6be', '#74c0fc', '#fff', '#f783ac'];
const BITS = Array.from({ length: 22 }, (_, i) => ({ left: `${(i * 37) % 100}%`, delay: `${(i % 7) * 0.45}s`, bg: COLORS[i % COLORS.length], dur: `${2.6 + (i % 5) * 0.3}s` }));

/** The release notes themselves: hero, the latest release open, earlier ones folded. Used by the page and by the sign-in screen. */
function WhatsNewBody({ active }: { active: boolean }) {
  const { api } = useSession();
  const [ver, setVer] = useState('');
  const poke = usePoke('celebrate');
  useEffect(() => { if (active) api.appVersion().then(setVer).catch(() => setVer('')); }, [active, api]);
  const [latest, ...older] = RELEASES;
  return (
    <div className="wn-page">
      <div className="wn-hero">
        <div className="wn-confetti" aria-hidden>{BITS.map((b, i) => <i key={i} style={{ left: b.left, background: b.bg, animationDelay: b.delay, animationDuration: b.dur }} />)}</div>
        <div className="wn-pilot"><PilotAvatar mood={poke.mood} height={140} onPoke={poke.poke} /></div>
        <div style={{ flex: 1, position: 'relative', alignSelf: 'center', textAlign: 'right', paddingRight: 28 }}>
          <h2>What is new</h2>
          <p>{latest ? latest.title : 'Release notes'}</p>
          {ver && <span className="wn-ver">Version {ver}</span>}
        </div>
      </div>
      <div className="wn-list">
        {RELEASES.length === 0 && <div className="muted">No release notes came with this version.</div>}
        {latest && (
          <div className="wn-card latest">
            <b>{latest.title}</b> <span className="muted">{latest.date}</span> <Tag color="green" variant="filled">Latest</Tag>
            <ul>{latest.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        )}
        {older.map((r) => (
          <details key={r.id} className="wn-card" open={false}>
            <summary>{r.title} <span className="muted" style={{ fontWeight: 400 }}>{r.date}</span></summary>
            <ul>{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </details>
        ))}
      </div>
    </div>
  );
}

/** What changed in this and earlier versions, as a full page (a tab in the app). Kept inside the app so it can be read offline. */
export function WhatsNewPage({ active = true }: { active?: boolean }) {
  return <WhatsNewBody active={active} />;
}

/** The same notes filling the whole window; used on the sign-in screen, where there are no tabs. */
export default function WhatsNew({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onCancel={onClose} footer={<Button type="primary" onClick={onClose}>Close</Button>} title={null}
      width="100vw" style={{ top: 0, maxWidth: '100vw', paddingBottom: 0 }} className="wn-full" destroyOnHidden>
      <WhatsNewBody active={open} />
    </Modal>
  );
}
