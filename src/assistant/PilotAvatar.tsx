import { useEffect, useState } from 'react';
import { useOwnerKey } from '../ui/GridPrefs';
import { readJson, writeJson } from '../ui/prefsMath';
import { CYCLE, FRAMES, SPRITES, type Mood } from './pilotMood';

const FILES = import.meta.glob('../assets/pilot/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const url = (name: string): string => FILES[`../assets/pilot/${name}.webp`] ?? '';

/** Whether to show the character at all (kept per person on this computer). */
export function usePilotOn(): [boolean, (v: boolean) => void] {
  const key = useOwnerKey('ask', 'character');
  const [on, setOn] = useState(() => readJson<boolean>(key, true, (v) => typeof v === 'boolean'));
  return [on, (v) => { setOn(v); writeJson(key, v); }];
}

/** Touching his picture shows his moods one by one; after a few quiet seconds he goes back to what he was doing. */
export function usePoke(base: Mood): { mood: Mood; poked: boolean; poke: () => void } {
  const [i, setI] = useState(-1);
  useEffect(() => { if (i < 0) return; const t = setTimeout(() => setI(-1), 7000); return () => clearTimeout(t); }, [i]);
  return { mood: i < 0 ? base : CYCLE[i], poked: i >= 0, poke: () => setI((x) => (x + 1) % CYCLE.length) };
}

/** RocketPilot, the assistant's character: the picture for the mood fades in, and he breathes gently. */
export default function PilotAvatar({ mood, height = 120, onPoke }: { mood: Mood; height?: number; onPoke?: () => void }) {
  const [pop, setPop] = useState(0);
  const frames = FRAMES[mood];
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (frames.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % frames.length), 380); // swaps while speaking
    return () => clearInterval(t);
  }, [mood, frames.length]);
  const show = frames[i % frames.length];
  return (
    <div className={`pilot-av${onPoke ? ' poke' : ''}`} style={{ height, width: Math.round(height * 0.75) }}
      role={onPoke ? 'button' : 'img'} aria-label={onPoke ? 'RocketPilot: touch to see his moods' : 'RocketPilot'} title={onPoke ? 'Touch me' : undefined}
      tabIndex={onPoke ? 0 : undefined}
      onClick={onPoke ? () => { setPop((n) => n + 1); onPoke(); } : undefined}
      onKeyDown={onPoke ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPop((n) => n + 1); onPoke(); } } : undefined}>
      <div className="pilot-float" key={pop} data-pop={pop > 0 ? '1' : undefined}>
        {SPRITES.map((n) => url(n) ? <img key={n} src={url(n)} alt="" draggable={false} className={n === show ? 'on' : ''} /> : null)}
      </div>
    </div>
  );
}
