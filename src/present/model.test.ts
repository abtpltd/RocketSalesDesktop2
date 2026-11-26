import { describe, expect, it } from 'vitest';
import { LAYOUTS, addBlock, capacity, changeLayout, clampSeconds, clampSize, duplicateDeck, duplicateSlide, hiddenCount, layoutOf, moveSlide,
  newDeck, newSlide, parseDeck, placePicture, removeSlide, type Block } from './model';

const pic = (): Block => ({ id: 'b1', kind: 'image', src: 'data:image/png;base64,AAAA', capturedOn: '2026-10-27' });

describe('layouts', () => {
  it('every region fits the 16:9 page and none overlap', () => {
    for (const l of LAYOUTS) {
      for (const r of [...(l.title ? [l.title] : []), ...l.regions]) {
        expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(100); expect(r.y + r.h).toBeLessThanOrEqual(56.25);
      }
      const all = [...(l.title ? [l.title] : []), ...l.regions];
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${l.id} regions ${i} and ${j}`).toBe(false);
      }
    }
  });
  it('an unknown layout falls back to one picture', () => { expect(layoutOf('nope').id).toBe('one'); });
});

describe('slides and decks', () => {
  it('a new deck has a title slide', () => { const d = newDeck('  Q4 review '); expect(d.name).toBe('Q4 review'); expect(d.slides[0].layout).toBe('title'); });
  it('a picture goes on the chosen slide while it has room, else on a new slide', () => {
    let d = newDeck('x');
    const one = { ...newSlide('two') }; d = { ...d, slides: [...d.slides, one] };
    let r = placePicture(d, pic(), 'Sales', one.id);
    expect(r.slideId).toBe(one.id);
    r = placePicture(r.deck, { ...pic(), id: 'b2' }, 'Sales', one.id);
    expect(r.deck.slides.find((s) => s.id === one.id)!.blocks).toHaveLength(2);
    r = placePicture(r.deck, { ...pic(), id: 'b3' }, 'Visits', one.id); // full: new slide
    expect(r.slideId).not.toBe(one.id);
    expect(r.deck.slides.at(-1)!.title).toBe('Visits');
  });
  it('a title slide never takes pictures', () => {
    const d = newDeck('x');
    expect(placePicture(d, pic(), 'T', d.slides[0].id).slideId).not.toBe(d.slides[0].id);
  });
  it('blocks beyond the layout are kept but counted as hidden', () => {
    let s = newSlide('grid4'); for (let i = 0; i < 4; i++) s = addBlock(s, { ...pic(), id: `p${i}` });
    expect(hiddenCount(s)).toBe(0);
    s = changeLayout(s, 'one');
    expect(capacity(s.layout)).toBe(1); expect(hiddenCount(s)).toBe(3); expect(s.blocks).toHaveLength(4);
  });
  it('move, duplicate and remove keep a valid deck', () => {
    let d = newDeck('x'); d = { ...d, slides: [d.slides[0], newSlide('one'), newSlide('two')] };
    const ids = d.slides.map((s) => s.id);
    expect(moveSlide(d, 0, -1)).toBe(d);
    expect(moveSlide(d, 0, 1).slides.map((s) => s.id)).toEqual([ids[1], ids[0], ids[2]]);
    const dup = duplicateSlide(d, 1); expect(dup.slides).toHaveLength(4); expect(dup.slides[2].id).not.toBe(ids[1]);
    expect(removeSlide({ ...d, slides: [d.slides[0]] }, 0).slides).toHaveLength(1);
    expect(duplicateDeck(d).id).not.toBe(d.id);
  });
  it('limits font size and timer', () => {
    expect([clampSize(2), clampSize(500), clampSize(NaN)]).toEqual([8, 96, 20]);
    expect([clampSeconds(0), clampSeconds(1), clampSeconds(500), clampSeconds(10)]).toEqual([0, 2, 120, 10]);
  });
});

describe('reading a stored deck', () => {
  it('repairs damaged parts and refuses non-decks', () => {
    expect(parseDeck(null)).toBeNull(); expect(parseDeck({ id: 'x', slides: [] })).toBeNull();
    const d = parseDeck({ id: 'x', name: 5, seconds: 9999, slides: [{ layout: 'weird', title: 7, bg: 'red',
      titleStyle: { font: 'Comic', size: 1000, color: 'blue', align: 'middle' },
      blocks: [{ kind: 'image', src: 'javascript:alert(1)' }, { kind: 'text', text: 'hi', style: { size: 'big' } }, { kind: 'video' }] }] })!;
    expect(d.seconds).toBe(120); expect(d.slides[0].layout).toBe('one'); expect(d.slides[0].bg).toBe('#ffffff');
    expect(d.slides[0].titleStyle).toMatchObject({ font: 'Inter', size: 96, color: '#14202e', align: 'left' });
    expect(d.slides[0].blocks).toHaveLength(2); expect(d.slides[0].blocks[0].src).toBeUndefined();
  });
});
