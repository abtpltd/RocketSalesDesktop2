import { useCallback, useEffect, useRef, useState } from 'react';
import SlideView from './SlideView';
import type { Deck } from './model';

/** Full-screen show: arrows / space / click move on, Esc leaves, an optional timer moves on by itself. */
export default function Player({ deck, start = 0, status = '', onRefresh, onClose }: { deck: Deck; start?: number; status?: string; onRefresh?: () => void; onClose: () => void }) {
  const [i, setI] = useState(Math.min(Math.max(0, start), deck.slides.length - 1));
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [hint, setHint] = useState(true);
  const [notes, setNotes] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const n = deck.slides.length;
  const go = useCallback((by: number) => setI((x) => Math.max(0, Math.min(n - 1, x + by))), [n]);

  useEffect(() => {
    const el = root.current;
    try { void el?.requestFullscreen?.()?.catch?.(() => undefined); } catch { /* the overlay still fills the window */ }
    const left = () => { if (!document.fullscreenElement) onClose(); };
    document.addEventListener('fullscreenchange', left);
    return () => { document.removeEventListener('fullscreenchange', left); if (document.fullscreenElement) void document.exitFullscreen?.(); };
  }, [onClose]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1); }
      else if (e.key === 'n' || e.key === 'N') setNotes((v) => !v);
      else if ((e.key === 'r' || e.key === 'R') && onRefresh) onRefresh();
      else if (e.key === 'Home') setI(0);
      else if (e.key === 'End') setI(n - 1);
    };
    const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('keydown', key); window.addEventListener('resize', resize);
    const t = window.setTimeout(() => setHint(false), 3000);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('resize', resize); window.clearTimeout(t); };
  }, [go, n, onClose, onRefresh]);

  useEffect(() => {
    if (!deck.seconds || i >= n - 1) return;
    const t = window.setTimeout(() => go(1), deck.seconds * 1000);
    return () => window.clearTimeout(t);
  }, [deck.seconds, i, n, go]);

  const width = Math.min(size.w, (size.h * 16) / 9);
  return (
    <div ref={root} className="present-ui" role="dialog" aria-label={`Presentation ${deck.name}`}
      onClick={() => go(1)}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: '#000', display: 'grid', placeItems: 'center', cursor: 'none' }}>
      <SlideView slide={deck.slides[i]} width={width} deck={deck} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: 'rgba(255,255,255,.15)' }}>
        <div style={{ height: '100%', width: `${((i + 1) / n) * 100}%`, background: '#3d9be0', transition: 'width .2s' }} />
      </div>
      <div style={{ position: 'absolute', right: 14, bottom: 12, color: '#9fb2c5', font: '12px Inter, sans-serif' }}>{i + 1} / {n}</div>
      {hint && <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', color: '#fff', background: 'rgba(0,0,0,.6)', padding: '6px 14px', borderRadius: 8, font: '13px Inter, sans-serif' }}>
        Arrow keys or click to move · N for notes · R to refresh live pictures · Esc to leave</div>}
      {status && <div role="status" style={{ position: 'absolute', left: 14, bottom: 12, color: '#fff', background: 'rgba(0,0,0,.6)', padding: '4px 12px', borderRadius: 8, font: '12px Inter, sans-serif' }}>{status}</div>}
      {notes && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: '50%', bottom: 30, transform: 'translateX(-50%)', width: Math.min(width, 900), maxHeight: '30vh', overflow: 'auto',
          background: 'rgba(0,0,0,.82)', color: '#fff', padding: '10px 16px', borderRadius: 10, font: '16px/1.4 Inter, sans-serif', whiteSpace: 'pre-wrap', cursor: 'default' }}>
          {deck.slides[i].notes.trim() || 'No notes for this slide.'}</div>
      )}
    </div>
  );
}
