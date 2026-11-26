// Latest and static decks: the badge shown on pictures and slides, dated static copies, and the comparison with the last copy.
import { newId, type Block, type Deck, type Slide, today } from './model';

const images = (d: Deck): Block[] => d.slides.flatMap((s) => s.blocks).filter((b) => b.kind === 'image' && !b.compare);
const newest = (dates: (string | undefined)[]) => dates.filter((x): x is string => !!x).sort().pop() ?? '';

/** The small label on one picture: what it is and as of which day. */
export function pictureBadge(deck: Deck, b: Block): string {
  const on = b.capturedOn ?? deck.updatedOn;
  if (b.compare) return `LAST FROZEN COPY · as of ${on}`;
  if (deck.mode === 'static') return `STATIC · as of ${on}`;
  if (b.live && !b.frozen) return `LIVE · as of ${on}`;
  if (b.live && b.frozen) return `KEPT · as of ${on}`;
  return `FIXED · as of ${on}`;
}

/** The label on every slide of the deck. */
export function deckBadge(deck: Deck): string {
  if (deck.mode === 'static') return `STATIC · as of ${deck.frozenOn || newest(images(deck).map((b) => b.capturedOn)) || deck.updatedOn}`;
  const live = images(deck).filter((b) => b.live && !b.frozen);
  return live.length ? `LATEST · refreshed ${newest(live.map((b) => b.capturedOn))}` : 'LATEST';
}

export const metaLine = (d: Deck) => [d.audience, d.period].filter(Boolean).join(' · ');

const cap = (name: string) => name.slice(0, 80);

/** A static, dated copy of a deck: the numbers as they are now, never refreshed. The original is not changed. */
export function freezeCopy(deck: Deck, on = today(), auto = false, asOf = on): Deck {
  const label = deck.period || `as of ${asOf}`;
  return {
    ...deck, id: newId('d'), name: cap(`${deck.name} – ${label}`), mode: 'static', frozenFrom: deck.frozenFrom ?? deck.id, frozenOn: asOf, auto: auto || undefined,
    autoCopy: false, pinned: false, lastOpened: '', updatedOn: on, brand: { ...deck.brand }, tags: [...deck.tags],
    slides: deck.slides.map((s) => ({ ...s, id: newId('s'), blocks: s.blocks.map((b) => ({ ...b, id: newId('b') })) })),
  };
}

/** Same deck, to hand to someone else: every picture stays as it is today (the receiver sees your numbers and they never change). */
export function asStatic(deck: Deck, on = today()): Deck {
  return { ...deck, mode: 'static', frozenOn: deck.frozenOn ?? (newest(images(deck).map((b) => b.capturedOn)) || on), autoCopy: false, pinned: false };
}

export const copiesOf = (deck: Deck, all: Deck[]) => all.filter((d) => d.frozenFrom === deck.id && d.id !== deck.id)
  .sort((a, b) => (b.frozenOn ?? '').localeCompare(a.frozenOn ?? '') || b.updatedOn.localeCompare(a.updatedOn));

/**
 * Before a refresh overwrites the numbers: the day those numbers are from, if a dated copy of them should be saved now.
 * One copy per day of numbers; none for a static deck, a deck that turned it off, or one with nothing live.
 */
export function copyNeeded(deck: Deck, all: Deck[], now = today()): string | null {
  if (deck.mode !== 'latest' || !deck.autoCopy) return null;
  const live = images(deck).filter((b) => b.live && !b.frozen && b.src);
  if (!live.length) return null;
  const asOf = newest(live.map((b) => b.capturedOn));
  if (!asOf || asOf >= now) return null; // numbers from today are not worth a copy
  return copiesOf(deck, all).some((c) => c.frozenOn === asOf) ? null : asOf;
}

/** Ids of the oldest automatic copies of a deck beyond the newest `keep`. */
export function oldAutoCopies(deck: Deck, all: Deck[], keep = 30): string[] {
  return copiesOf(deck, all).filter((c) => c.auto).slice(keep).map((c) => c.id);
}

const key = (b: Block) => (b.live ? `${b.live.page}|${b.live.title}` : '');

/** Fills the right-hand picture of each comparison slide from the newest frozen copy of the deck that has the same card. */
export function resolveCompare(deck: Deck, all: Deck[]): Deck {
  if (deck.mode === 'static') return deck;
  const copy = copiesOf(deck, all)[0];
  if (!copy) return deck;
  const source = new Map<string, Block>();
  for (const s of copy.slides) for (const b of s.blocks) if (b.kind === 'image' && b.src && !b.compare && key(b)) source.set(key(b), b);
  const slides: Slide[] = deck.slides.map((s) => {
    if (s.layout !== 'compare') return s;
    const left = s.blocks[0];
    const found = left && left.kind === 'image' ? source.get(key(left)) : undefined;
    if (!found) return s;
    const right: Block = { id: s.blocks[1]?.id ?? newId('b'), kind: 'image', src: found.src, capturedOn: found.capturedOn, caption: 'Last frozen copy', compare: true, frozen: true };
    return { ...s, blocks: [left, right, ...s.blocks.slice(2)] };
  });
  return { ...deck, slides };
}

/** The agenda text from the slide titles: sections as headings, then numbered slides. */
export function agendaText(deck: Deck): string {
  const lines: string[] = [];
  let n = 0;
  for (const s of deck.slides) {
    if (s.layout === 'title' || s.layout === 'agenda') continue;
    if (s.layout === 'section') { lines.push(s.title.toUpperCase()); n = 0; continue; }
    lines.push(`${++n}. ${s.title}`);
  }
  return lines.join('\n') || 'No slides yet.';
}

export function fillAgenda(deck: Deck, slideId: string): Deck {
  const text = agendaText(deck);
  return { ...deck, slides: deck.slides.map((s) => (s.id !== slideId || s.layout !== 'agenda' ? s
    : { ...s, blocks: s.blocks.length ? s.blocks.map((b, i) => (i === 0 && b.kind === 'text' ? { ...b, text } : b)) : s.blocks })) };
}
