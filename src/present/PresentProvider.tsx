import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App as AntApp, Button, Input, Modal, Radio, Select } from 'antd';
import { useTheme } from '../theme';
import type { SessionInfo } from '../api/types';
import { capturable, locateLive, snapshot, titleOf, waitForCard } from './capture';
import { liveBlocks, newDeck, newId, placePicture, today, type Deck, type LiveRef } from './model';
import { copyNeeded, freezeCopy, oldAutoCopies, resolveCompare } from './modes';
import Player from './Player';
import { refreshDeck } from './refresh';
import { useDeckStore } from './useDeckStore';

interface Ctx { pick: () => void; picking: boolean; play: (deck: Deck, start?: number) => void; refreshNow: (deck: Deck) => Promise<void> }
const PresentCtx = createContext<Ctx>({ pick: () => undefined, picking: false, play: () => undefined, refreshNow: async () => undefined });
export const usePresent = () => useContext(PresentCtx);

/** "Add to presentation": click any card, chart, table or grid on the page; then choose the presentation and slide. */
const REFRESH_EVERY_MS = 5 * 60 * 1000;
const bgNow = (dark: boolean) => getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || (dark ? '#13212f' : '#ffffff');

export default function PresentProvider({ info, page, tabs, goto, closeTab, openPresentations, children }: {
  info: SessionInfo; page: string; tabs: string[]; goto: (id: string) => void; closeTab: (id: string) => void; openPresentations: () => void; children: ReactNode;
}) {
  const { message } = AntApp.useApp();
  const { dark } = useTheme();
  const store = useDeckStore(info);
  const [picking, setPicking] = useState(false);
  const [shot, setShot] = useState<{ src: string; title: string; live?: LiveRef } | null>(null);
  const [show, setShow] = useState<{ deck: Deck; start: number } | null>(null);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const pageRef = useRef(page);
  pageRef.current = page;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const busy = useRef(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckId, setDeckId] = useState<string>('new');
  const [newName, setNewName] = useState('');
  const [where, setWhere] = useState<'new' | 'last'>('new');
  const [title, setTitle] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const hot = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!picking) return;
    const show = (el: HTMLElement | null) => {
      hot.current = el;
      const b = box.current; if (!b) return;
      if (!el) { b.style.display = 'none'; return; }
      const r = el.getBoundingClientRect();
      Object.assign(b.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    const move = (e: MouseEvent) => show(capturable(e.target));
    const click = async (e: MouseEvent) => {
      const el = capturable(e.target);
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      const live = locateLive(el, pageRef.current); // before the picture, while the page still shows
      setPicking(false); show(null);
      try {
        const src = await snapshot(el, bgNow(dark));
        setTitle(titleOf(el));
        setShot({ src, title: titleOf(el), live });
        void store.list().then((d) => { setDecks(d); setDeckId(d[0]?.id ?? 'new'); });
      } catch { message.error('Could not take a picture of that. Try another card.'); }
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPicking(false); show(null); } };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', key, true);
    const prev = document.body.style.cursor; document.body.style.cursor = 'crosshair';
    return () => { document.removeEventListener('mousemove', move, true); document.removeEventListener('click', click, true); document.removeEventListener('keydown', key, true); document.body.style.cursor = prev; };
  }, [picking, dark, message, store]);

  const pick = useCallback(() => setPicking(true), []);

  /** Takes every live picture of the deck again (a latest deck only). Before the older numbers are overwritten, a dated static copy of
   *  them is saved when the deck asks for one. The full-screen show, or a short cover, hides the pages visited. */
  const refresh = useCallback(async (deck: Deck) => {
    const hasLive = liveBlocks(deck).length > 0;
    const hasCompare = deck.mode === 'latest' && deck.slides.some((s) => s.layout === 'compare');
    if (busy.current || (!hasLive && !hasCompare)) return;
    busy.current = true;
    setWorking(true);
    setStatus('Updating live pictures…');
    const before = new Set(tabsRef.current);
    let note = '';
    try {
      const all = await store.list().catch(() => [] as Deck[]);
      const asOf = copyNeeded(deck, all);
      if (asOf) {
        const copy = freezeCopy(deck, today(), true, asOf);
        await store.save(copy); all.push(copy);
        for (const id of oldAutoCopies(deck, all)) await store.remove(id).catch(() => undefined);
        note = `Saved a copy of the older numbers as “${copy.name}”. `;
      }
      let next = deck; let failed = 0; let failedTitles: string[] = [];
      if (hasLive) {
        const r = await refreshDeck(deck, pageRef.current, {
          goto, settle: () => new Promise((res) => setTimeout(res, 600)),
          take: async (ref) => { const el = await waitForCard(ref); return el ? snapshot(el, bgNow(dark)) : null; },
          progress: (d, t) => setStatus(`Updating live pictures… ${d} of ${t}`),
        });
        next = r.deck; failed = r.failed; failedTitles = r.failedTitles;
      }
      next = resolveCompare(next, all);
      setShow((s) => (s && s.deck.id === deck.id ? { ...s, deck: next } : s));
      await store.save(next).catch(() => undefined);
      window.dispatchEvent(new CustomEvent('present-deck', { detail: next }));
      const warn = failed ? `${failed} picture${failed === 1 ? '' : 's'} could not be updated and show older numbers: ${[...new Set(failedTitles)].join(', ')}.` : '';
      setStatus(`${note}${warn}`.trim());
      if (note || warn) window.setTimeout(() => setStatus(''), warn ? 15000 : 8000);
    } finally {
      busy.current = false;
      setWorking(false);
      // pages opened only to retake a picture are closed again
      for (const p of new Set(liveBlocks(deck).map((i) => i.block.live!.page))) if (!before.has(p)) closeTab(p);
    }
  }, [dark, goto, closeTab, store]);

  const play = useCallback((deck: Deck, start = 0) => { setShow({ deck, start }); void refresh(deck); }, [refresh]);
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    if (!show || !liveBlocks(show.deck).length) return;
    const t = window.setInterval(() => { const d = showRef.current?.deck; if (d) void refresh(d); }, REFRESH_EVERY_MS);
    return () => window.clearInterval(t);
  }, [show?.deck.id, refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => ({ pick, picking, play, refreshNow: refresh }), [pick, picking, play, refresh]);

  const add = async () => {
    if (!shot) return;
    const block = { id: newId('b'), kind: 'image' as const, src: shot.src, capturedOn: today(), caption: title, live: shot.live };
    let deck = deckId === 'new' ? newDeck(newName || 'My presentation') : decks.find((d) => d.id === deckId);
    if (!deck) return;
    const last = deck.slides[deck.slides.length - 1];
    const r = placePicture(deck, block, title, where === 'last' ? last?.id : undefined);
    deck = r.deck;
    try { await store.save(deck); setShot(null); message.success({ content: <span>Added to “{deck.name}”. <a onClick={openPresentations}>Open presentations</a></span>, duration: 5 }); }
    catch { message.error('Could not save on this computer.'); }
  };

  return (
    <PresentCtx.Provider value={ctx}>
      {children}
      {picking && <>
        <div className="present-ui" style={{ position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 4000, background: '#14202e', color: '#fff', padding: '8px 16px', borderRadius: 8, font: '13px Inter, sans-serif' }}>
          Click a card, chart or table to add it to a presentation · Esc to cancel</div>
        <div ref={box} aria-hidden style={{ display: 'none', position: 'fixed', zIndex: 3900, pointerEvents: 'none', border: '3px solid #1370b6', background: 'rgba(19,112,182,.12)', borderRadius: 6 }} />
      </>}
      <Modal open={!!shot} title="Add to presentation" onCancel={() => setShot(null)} width={520} className="present-ui"
        footer={[<Button key="c" onClick={() => setShot(null)}>Cancel</Button>, <Button key="a" type="primary" onClick={() => void add()}>Add</Button>]}>
        {shot && <img src={shot.src} alt="Picture to add" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 6, marginBottom: 12 }} />}
        <div className="muted" style={{ marginBottom: 4 }}>Presentation</div>
        <Select aria-label="Presentation" value={deckId} onChange={setDeckId} style={{ width: '100%', marginBottom: 8 }}
          options={[...decks.map((d) => ({ value: d.id, label: d.name })), { value: 'new', label: '+ A new presentation' }]} />
        {deckId === 'new' && <Input aria-label="New presentation name" placeholder="Name of the new presentation" value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} style={{ marginBottom: 8 }} />}
        <div className="muted" style={{ margin: '8px 0 4px' }}>Slide</div>
        <Radio.Group value={where} onChange={(e) => setWhere(e.target.value)}>
          <Radio value="new">On a new slide</Radio>
          <Radio value="last" disabled={deckId === 'new'}>On the last slide, if it has room</Radio>
        </Radio.Group>
        <div className="muted" style={{ margin: '10px 0 4px' }}>Slide title</div>
        <Input aria-label="Slide title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <p className="muted" style={{ marginTop: 10 }}>The picture shows the numbers as they are today ({today()}).
          {shot?.live ? ' When you present, it is taken again from this page, so the numbers are current.' : ' This one cannot be refreshed by itself; it stays as it is today.'}</p>
      </Modal>
      {!show && working && (
        <div className="present-ui" role="status" style={{ position: 'fixed', inset: 0, zIndex: 3500, background: 'rgba(255,255,255,.94)', display: 'grid', placeItems: 'center', font: '18px Inter, sans-serif', color: '#14202e' }}>{status || 'Updating live pictures…'}</div>
      )}
      {show && <Player deck={show.deck} start={show.start} status={status} onRefresh={() => void refresh(show.deck)} onClose={() => setShow(null)} />}
    </PresentCtx.Provider>
  );
}
