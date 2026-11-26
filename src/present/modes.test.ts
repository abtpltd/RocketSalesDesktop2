import { describe, expect, it } from 'vitest';
import { fileNameFor, runAutoBackup, secretName, type LastRun } from './autobackup';
import { unpackDecks } from './backup';
import { AUDIENCES, TEMPLATES, deckFromTemplate, liveBlocks, newDeck, newId, newSlide, parseDeck, placePicture, type Deck } from './model';
import { agendaText, asStatic, copiesOf, copyNeeded, deckBadge, fillAgenda, freezeCopy, metaLine, oldAutoCopies, pictureBadge, resolveCompare } from './modes';
import { filterDecks, noFilter, recentDecks, sortDecks } from './organise';
import { memoryStore } from './store';

const IMG = (n: string) => `data:image/png;base64,${n}`;
const live = (title: string, page = 'dashboard') => ({ page, title, nth: 0 });

function deck(on = '2026-09-27'): Deck {
  let d = newDeck('Monthly review');
  d = placePicture(d, { id: newId('b'), kind: 'image', src: IMG('OLD1'), capturedOn: on, live: live('Sales') }, 'Sales').deck;
  d = placePicture(d, { id: newId('b'), kind: 'image', src: IMG('FIX'), capturedOn: on }, 'Fixed').deck;
  return d;
}

describe('badges and modes', () => {
  it('labels each picture and the whole deck by mode', () => {
    const d = deck();
    const [liveB, fixedB] = d.slides.flatMap((s) => s.blocks).filter((b) => b.kind === 'image');
    expect(pictureBadge(d, liveB)).toBe('LIVE · as of 2026-09-27');
    expect(pictureBadge(d, fixedB)).toBe('FIXED · as of 2026-09-27');
    expect(pictureBadge(d, { ...liveB, frozen: true })).toBe('KEPT · as of 2026-09-27');
    expect(deckBadge(d)).toBe('LATEST · refreshed 2026-09-27');
    const st = { ...d, mode: 'static' as const };
    expect(pictureBadge(st, liveB)).toBe('STATIC · as of 2026-09-27');
    expect(deckBadge(st)).toBe('STATIC · as of 2026-09-27');
    expect(liveBlocks(st)).toHaveLength(0); // a static deck is never refreshed
    expect(pictureBadge(d, { ...liveB, compare: true })).toContain('LAST FROZEN COPY');
  });
  it('the title slide line shows audience and period', () => {
    expect(metaLine({ ...newDeck('x'), audience: 'Management', period: 'October 2026' })).toBe('Management · October 2026');
    expect(metaLine(newDeck('x'))).toBe('');
  });
});

describe('frozen copies', () => {
  it('a copy is static, dated, independent and points at the original', () => {
    const d = { ...deck(), period: 'September 2026', audience: 'Management', tags: ['q3'] };
    const c = freezeCopy(d, '2026-10-27', false, '2026-09-27');
    expect(c.mode).toBe('static'); expect(c.frozenFrom).toBe(d.id); expect(c.frozenOn).toBe('2026-09-27');
    expect(c.name).toBe('Monthly review – September 2026');
    expect(c.id).not.toBe(d.id); expect(c.slides[0].id).not.toBe(d.slides[0].id);
    expect(c.slides.flatMap((s) => s.blocks).map((b) => b.src)).toEqual(d.slides.flatMap((s) => s.blocks).map((b) => b.src));
    expect(freezeCopy(c).frozenFrom).toBe(d.id); // a copy of a copy still points at the first deck
    expect(parseDeck(JSON.parse(JSON.stringify(c)))!.frozenOn).toBe('2026-09-27');
  });
  it('asks for an automatic copy once per day of numbers, only for a latest deck that wants it', () => {
    const d = deck('2026-09-27');
    expect(copyNeeded(d, [], '2026-10-27')).toBe('2026-09-27');
    const c = freezeCopy(d, '2026-10-27', true, '2026-09-27');
    expect(copyNeeded(d, [d, c], '2026-10-27')).toBeNull(); // already saved
    expect(copyNeeded(d, [], '2026-09-27')).toBeNull(); // numbers from today
    expect(copyNeeded({ ...d, autoCopy: false }, [], '2026-10-27')).toBeNull();
    expect(copyNeeded({ ...d, mode: 'static' }, [], '2026-10-27')).toBeNull();
    expect(copyNeeded(newDeck('plain'), [], '2026-10-27')).toBeNull(); // nothing live
  });
  it('keeps the newest 30 automatic copies and never removes a manual one', () => {
    const d = deck();
    const autos = Array.from({ length: 33 }, (_, i) => freezeCopy(d, '2026-10-27', true, `2026-08-${String(i + 1).padStart(2, '0')}`));
    const manual = freezeCopy(d, '2026-10-27', false, '2026-01-01');
    const old = oldAutoCopies(d, [d, manual, ...autos]);
    expect(old).toHaveLength(3);
    expect(old).not.toContain(manual.id);
    const dates = autos.filter((a) => old.includes(a.id)).map((a) => a.frozenOn);
    expect(dates.sort()).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
  });
  it('sharing as static keeps the pictures and stops them refreshing', () => {
    const s = asStatic(deck());
    expect(s.mode).toBe('static'); expect(liveBlocks(s)).toHaveLength(0); expect(s.slides.flatMap((x) => x.blocks).some((b) => b.src === IMG('OLD1'))).toBe(true);
  });
});

describe('comparison with the last frozen copy', () => {
  it('fills the right-hand picture from the newest copy that has the same card', () => {
    let d = deck('2026-10-27');
    const cmp = newSlide('compare');
    d = { ...d, slides: [...d.slides, { ...cmp, blocks: [{ id: newId('b'), kind: 'image', src: IMG('NOW'), capturedOn: '2026-10-27', live: live('Sales') }] }] };
    const older = freezeCopy({ ...deck('2026-08-27') }, '2026-09-01', true, '2026-08-27');
    const newer = { ...freezeCopy(deck('2026-09-27'), '2026-10-01', true, '2026-09-27') };
    const orphan = { ...newer, id: 'x', frozenFrom: 'other' };
    [older, newer].forEach((c) => { c.frozenFrom = d.id; });
    const out = resolveCompare(d, [d, older, newer, orphan]);
    const right = out.slides.find((s) => s.layout === 'compare')!.blocks[1];
    expect(right.compare).toBe(true); expect(right.src).toBe(IMG('OLD1')); expect(right.capturedOn).toBe('2026-09-27');
    expect(deckBadge(out)).toContain('LATEST');
    expect(copiesOf(d, [d, older, newer, orphan]).map((c) => c.frozenOn)).toEqual(['2026-09-27', '2026-08-27']);
    expect(liveBlocks(out).every((x) => !x.block.compare)).toBe(true); // the right-hand picture is never refreshed
    expect(resolveCompare(d, [d])).toBe(d); // no copy: unchanged
    expect(resolveCompare({ ...d, mode: 'static' }, [d, newer])).toEqual({ ...d, mode: 'static' });
  });
});

describe('agenda, sign-off and starter decks', () => {
  it('the agenda lists slide titles, with sections as headings', () => {
    let d = deckFromTemplate(TEMPLATES[2]);
    const ag = newSlide('agenda'); d = { ...d, slides: [d.slides[0], ag, ...d.slides.slice(1)] };
    const t = agendaText(d);
    expect(t).toContain('PRODUCTS'); expect(t).toContain('1. Product sales'); expect(t).toContain('CUSTOMERS AND STOCK'); expect(t).toContain('1. Customer groups');
    expect(t).not.toContain('Agenda');
    const filled = fillAgenda(d, ag.id);
    expect(filled.slides[1].blocks[0].text).toBe(t);
  });
  it('the sign-off slide starts with decision, owner and due lines', () => {
    expect(newSlide('signoff').blocks[0].text).toContain('Decision: ____   Owner: ____   Due: ____');
  });
  it('every starter deck is valid with the new slide types', () => {
    for (const t of TEMPLATES) expect(parseDeck(JSON.parse(JSON.stringify(deckFromTemplate(t))))).not.toBeNull();
    expect(TEMPLATES[0].slides.map((s) => s.layout)).toEqual(expect.arrayContaining(['agenda', 'compare', 'signoff']));
  });
});

describe('finding decks', () => {
  const mk = (name: string, extra: Partial<Deck> = {}): Deck => ({ ...newDeck(name), ...extra });
  const a = mk('Weekly reps', { audience: 'Sales reps', periodKind: 'week', period: 'Week 43', folder: 'Weekly', tags: ['field'], updatedOn: '2026-10-20', lastOpened: '2026-10-26T10:00:00Z' });
  const b = mk('Board pack', { audience: 'Management', periodKind: 'month', period: 'October 2026', folder: 'Monthly', pinned: true, updatedOn: '2026-10-01', lastOpened: '2026-10-27T09:00:00Z' });
  const c = mk('Board pack – Sep', { audience: 'Management', frozenFrom: b.id, frozenOn: '2026-09-27', updatedOn: '2026-10-02' });
  it('searches name, audience, period, folder and tags', () => {
    const all = [a, b, c];
    expect(filterDecks(all, { ...noFilter(), q: 'field' })).toEqual([a]);
    expect(filterDecks(all, { ...noFilter(), q: 'october' })).toEqual([b]);
    expect(filterDecks(all, { ...noFilter(), audience: 'Management' })).toEqual([b]); // frozen copies hidden by default
    expect(filterDecks(all, { ...noFilter(), audience: 'Management', showCopies: true })).toEqual([b, c]);
    expect(filterDecks(all, { ...noFilter(), folder: 'Weekly' })).toEqual([a]);
    expect(filterDecks(all, { ...noFilter(), periodKind: 'month' })).toEqual([b]);
  });
  it('pinned first, then newest; recent by last opened', () => {
    expect(sortDecks([a, b, c]).map((d) => d.name)).toEqual(['Board pack', 'Weekly reps', 'Board pack – Sep']);
    expect(recentDecks([a, b, c]).map((d) => d.name)).toEqual(['Board pack', 'Weekly reps']);
  });
  it('an old deck without these fields opens as a latest deck', () => {
    const old = JSON.parse(JSON.stringify(newDeck('Old')));
    for (const k of ['mode', 'audience', 'periodKind', 'period', 'folder', 'tags', 'pinned', 'lastOpened', 'autoCopy', 'showMeta']) delete old[k];
    const d = parseDeck(old)!;
    expect(d.mode).toBe('latest'); expect(d.autoCopy).toBe(true); expect(d.tags).toEqual([]); expect(d.showMeta).toBe(true);
    expect(AUDIENCES).toContain('Management');
  });
});

describe('automatic backup', () => {
  const calls: { name: string; data: string; keep: number }[] = [];
  const api = (pw: string | null) => ({ backupSecret: async () => pw, saveBackup: async (name: string, data: string, keep: number) => { calls.push({ name, data, keep }); return `C:\\Docs\\${name}`; } });
  const lastRun = (init = ''): LastRun & { v: string } => { const o = { v: init, get: () => o.v, set: (d: string) => { o.v = d; } }; return o; };
  it('does nothing without a password, saves a locked file once a day, keeps five', async () => {
    const store = memoryStore(); await store.save(deck());
    calls.length = 0;
    expect((await runAutoBackup(api(null), store, 's', lastRun())).kind).toBe('no_password');
    const last = lastRun();
    const first = await runAutoBackup(api('hunter2'), store, 's', last, { day: '2026-10-27' });
    expect(first.kind).toBe('saved'); expect(calls[0].name).toBe(fileNameFor('2026-10-27')); expect(calls[0].keep).toBe(5);
    const text = Buffer.from(calls[0].data, 'base64').toString();
    expect(text).toContain('"enc":true'); expect(text).not.toContain('Monthly review');
    expect((await unpackDecks(text, 'hunter2'))[0].name).toBe('Monthly review');
    expect((await runAutoBackup(api('hunter2'), store, 's', last, { day: '2026-10-27' })).kind).toBe('skipped');
    expect((await runAutoBackup(api('hunter2'), store, 's', last, { day: '2026-10-27', force: true })).kind).toBe('saved');
    expect((await runAutoBackup(api('hunter2'), store, 's', last, { day: '2026-10-28' })).kind).toBe('saved');
    expect((await runAutoBackup(api('hunter2'), memoryStore(), 's', lastRun(), { day: '2026-10-29' })).kind).toBe('skipped'); // nothing to save
  });
  it('reports a failure instead of throwing', async () => {
    const store = memoryStore(); await store.save(deck());
    const bad = { backupSecret: async () => 'pw', saveBackup: async () => { throw new Error('disk full'); } };
    expect(await runAutoBackup(bad, store, 's', lastRun())).toEqual({ kind: 'failed', error: 'disk full' });
  });
  it('the password is kept under a name for this person and company only', () => {
    expect(secretName('ACME', 'Boss@Acme.com')).toBe('presentation-backup|acme|boss@acme.com');
  });
});
