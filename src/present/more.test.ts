import { describe, expect, it } from 'vitest';
import { BackupError, isLocked, packDecks, planImport, unpackDecks } from './backup';
import { deckToPptx } from './exportPptx';
import { TEMPLATES, applyRefresh, deckFromTemplate, liveBlocks, newDeck, newId, newSlide, parseDeck, placePicture, duplicateDeck, type Deck } from './model';
import { refreshDeck } from './refresh';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const live = { page: 'master:customers', title: 'Customers', nth: 0 };

function deckWithPictures(): Deck {
  let d = newDeck('Review');
  d = placePicture(d, { id: newId('b'), kind: 'image', src: PNG, capturedOn: '2026-01-01', live }, 'Customers').deck;
  d = placePicture(d, { id: newId('b'), kind: 'image', src: PNG, capturedOn: '2026-01-01' }, 'Fixed').deck;
  d = placePicture(d, { id: newId('b'), kind: 'image', src: PNG, capturedOn: '2026-01-01', live: { ...live, page: 'dashboard', title: 'Sales' } }, 'Sales').deck;
  return d;
}

describe('notes, brand and live pictures in a stored deck', () => {
  it('keeps notes, brand and live references, and repairs damaged ones', () => {
    const d = deckWithPictures();
    d.slides[0].notes = 'Say hello';
    d.brand = { logo: PNG, footer: 'Acme · Confidential', showLogo: true, showFooter: false };
    const back = parseDeck(JSON.parse(JSON.stringify(d)))!;
    expect(back.slides[0].notes).toBe('Say hello');
    expect(back.brand).toEqual(d.brand);
    expect(liveBlocks(back).map((x) => x.block.live!.title)).toEqual(['Customers', 'Sales']);
    const bad = parseDeck({ ...JSON.parse(JSON.stringify(d)), brand: { logo: 'javascript:alert(1)', footer: 5 } })!;
    expect(bad.brand.logo).toBe('');
    expect(bad.brand.footer).toBe('');
  });
  it('an older deck without notes or brand still opens', () => {
    const old = JSON.parse(JSON.stringify(newDeck('Old')));
    delete old.brand; old.slides.forEach((s: { notes?: string }) => delete s.notes);
    const d = parseDeck(old)!;
    expect(d.brand.showLogo).toBe(true);
    expect(d.slides[0].notes).toBe('');
  });
  it('a picture kept as it is is not refreshed', () => {
    const d = deckWithPictures();
    d.slides.forEach((s) => s.blocks.forEach((b) => { if (b.live?.title === 'Sales') b.frozen = true; }));
    expect(liveBlocks(d).map((x) => x.block.live!.title)).toEqual(['Customers']);
  });
});

describe('starter decks', () => {
  it('every template makes a valid deck with its slides', () => {
    for (const t of TEMPLATES) {
      const d = deckFromTemplate(t);
      expect(d.slides).toHaveLength(t.slides.length);
      expect(parseDeck(JSON.parse(JSON.stringify(d)))).not.toBeNull();
      expect(d.slides[0].layout).toBe('title');
    }
    expect(deckFromTemplate(TEMPLATES[0], 'May review').name).toBe('May review');
  });
});

describe('refreshing live pictures', () => {
  it('visits each page once, retakes live pictures, marks missing cards, and goes back', async () => {
    const d = deckWithPictures();
    const visited: string[] = [];
    const r = await refreshDeck(d, 'presentations', {
      goto: (p) => visited.push(p), on: '2026-02-02',
      take: async (ref) => (ref.title === 'Customers' ? 'data:image/png;base64,NEW' : null),
    });
    expect(visited).toEqual(['master:customers', 'dashboard', 'presentations']);
    expect(r.refreshed).toBe(1); expect(r.failed).toBe(1); expect(r.failedTitles).toEqual(['Sales']);
    const customers = r.deck.slides.flatMap((s) => s.blocks).find((b) => b.live?.title === 'Customers')!;
    const sales = r.deck.slides.flatMap((s) => s.blocks).find((b) => b.live?.title === 'Sales')!;
    expect(customers.src).toBe('data:image/png;base64,NEW'); expect(customers.capturedOn).toBe('2026-02-02');
    expect(sales.src).toBe(PNG); expect(sales.refreshFailedOn).toBe('2026-02-02'); // old picture kept
    const fixed = r.deck.slides.flatMap((s) => s.blocks).find((b) => b.kind === 'image' && !b.live)!;
    expect(fixed.src).toBe(PNG);
  });
  it('returns to the starting page even when taking a picture throws', async () => {
    const visited: string[] = [];
    const r = await refreshDeck(deckWithPictures(), 'home', { goto: (p) => visited.push(p), take: async () => { throw new Error('x'); } });
    expect(r.failed).toBe(2); expect(visited[visited.length - 1]).toBe('home');
  });
  it('a deck with no live pictures visits nothing', async () => {
    const visited: string[] = [];
    await refreshDeck(newDeck('Plain'), 'home', { goto: (p) => visited.push(p), take: async () => null });
    expect(visited).toEqual(['home']);
  });
  it('applyRefresh clears an earlier failure when it works', () => {
    const d = deckWithPictures();
    const id = d.slides.flatMap((s) => s.blocks).find((b) => b.live)!.id;
    const failed = applyRefresh(d, id, null, '2026-03-03');
    const ok = applyRefresh(failed, id, 'data:image/png;base64,Z', '2026-03-04');
    expect(ok.slides.flatMap((s) => s.blocks).find((b) => b.id === id)!.refreshFailedOn).toBeUndefined();
  });
});

describe('backup and sharing file', () => {
  it('a plain file reads back the same decks', async () => {
    const d = deckWithPictures();
    const text = await packDecks([d]);
    expect(isLocked(text)).toBe(false);
    const back = await unpackDecks(text);
    expect(back[0].name).toBe('Review'); expect(back[0].slides.length).toBe(d.slides.length);
  });
  it('a locked file needs the right password and hides the content', async () => {
    const d = deckWithPictures(); d.slides[0].notes = 'secret plan';
    const text = await packDecks([d], 'open sesame');
    expect(isLocked(text)).toBe(true);
    expect(text).not.toContain('secret plan'); expect(text).not.toContain('Review');
    await expect(unpackDecks(text)).rejects.toMatchObject({ code: 'needs_password' });
    await expect(unpackDecks(text, 'wrong')).rejects.toMatchObject({ code: 'wrong_password' });
    expect((await unpackDecks(text, 'open sesame'))[0].slides[0].notes).toBe('secret plan');
  });
  it('rejects files that are not presentations', async () => {
    await expect(unpackDecks('hello')).rejects.toBeInstanceOf(BackupError);
    await expect(unpackDecks('{"format":"other"}')).rejects.toMatchObject({ code: 'not_a_backup' });
    await expect(unpackDecks(JSON.stringify({ format: 'rocketsales-presentations', enc: false, decks: [] }))).rejects.toMatchObject({ code: 'empty' });
  });
  it('importing never overwrites: same and unchanged is skipped, changed or new is added as a copy', () => {
    const a = deckWithPictures(); const b = duplicateDeck(a); const changed = { ...a, name: 'Edited elsewhere' };
    const plan = planImport([a], [a, changed, b]);
    expect(plan.skipped).toBe(1);
    expect(plan.add).toHaveLength(2);
    expect(plan.add[0].id).not.toBe(a.id); expect(plan.add[0].name).toContain('(imported)');
    expect(plan.add[1].id).toBe(b.id);
    expect(new Set(plan.add.flatMap((d) => d.slides.map((s) => s.id))).size).toBe(plan.add.flatMap((d) => d.slides).length);
  });
});

describe('PowerPoint file', () => {
  it('makes a real .pptx (a zip) for a deck with text, pictures, notes and a brand', async () => {
    const d = deckWithPictures();
    d.slides[1].notes = 'Notes for the second slide';
    d.slides.push({ ...newSlide('text'), title: 'Words', blocks: [{ id: newId('b'), kind: 'text', text: 'Hello', style: { font: 'Arial', size: 20, bold: true, italic: false, color: '#112233', align: 'left' } }] });
    d.brand = { logo: PNG, footer: 'Acme', showLogo: true, showFooter: true };
    const b64 = await deckToPptx(d);
    const bytes = Buffer.from(b64, 'base64');
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slides).toHaveLength(d.slides.length);
    const all = (await Promise.all(slides.map((f) => zip.file(f)!.async('string')))).join('');
    expect(all).toContain('Hello'); expect(all).toContain('Words'); expect(all).toContain('Acme');
    const notes = Object.keys(zip.files).filter((f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f));
    expect((await Promise.all(notes.map((f) => zip.file(f)!.async('string')))).join('')).toContain('Notes for the second slide');
  });
});
