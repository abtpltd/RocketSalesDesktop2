// Presentations: a person's own slide decks of snapshots of dashboard cards, charts, tables and grids, plus titles and
// text they type. Decks are personal and stay on this computer. A slide is placed by a layout: fixed regions on a
// 16:9 page (100 x 56.25 units), so nothing is drawn freehand and nothing overlaps.

export type LayoutId = 'title' | 'one' | 'two' | 'text-image' | 'grid4' | 'text' | 'agenda' | 'section' | 'signoff' | 'compare';
export interface Region { x: number; y: number; w: number; h: number }
export interface LayoutDef { id: LayoutId; name: string; title: Region | null; regions: Region[] }

const TITLE: Region = { x: 4, y: 3, w: 92, h: 10 };
export const LAYOUTS: LayoutDef[] = [
  { id: 'title', name: 'Title slide', title: { x: 8, y: 16, w: 84, h: 14 }, regions: [{ x: 8, y: 32, w: 84, h: 12 }] },
  { id: 'one', name: 'One picture', title: TITLE, regions: [{ x: 4, y: 15, w: 92, h: 38 }] },
  { id: 'two', name: 'Two pictures', title: TITLE, regions: [{ x: 4, y: 15, w: 45, h: 38 }, { x: 51, y: 15, w: 45, h: 38 }] },
  { id: 'text-image', name: 'Text and picture', title: TITLE, regions: [{ x: 4, y: 15, w: 34, h: 38 }, { x: 40, y: 15, w: 56, h: 38 }] },
  { id: 'grid4', name: 'Four pictures', title: TITLE, regions: [{ x: 4, y: 15, w: 45, h: 18.5 }, { x: 51, y: 15, w: 45, h: 18.5 }, { x: 4, y: 34.5, w: 45, h: 18.5 }, { x: 51, y: 34.5, w: 45, h: 18.5 }] },
  { id: 'text', name: 'Text only', title: TITLE, regions: [{ x: 6, y: 16, w: 88, h: 36 }] },
  { id: 'agenda', name: 'Agenda', title: TITLE, regions: [{ x: 6, y: 16, w: 88, h: 36 }] },
  { id: 'section', name: 'Section divider', title: { x: 8, y: 20, w: 84, h: 16 }, regions: [] },
  { id: 'signoff', name: 'Decisions and actions', title: TITLE, regions: [{ x: 6, y: 16, w: 88, h: 36 }] },
  { id: 'compare', name: 'This period and last frozen copy', title: TITLE, regions: [{ x: 4, y: 15, w: 45, h: 38 }, { x: 51, y: 15, w: 45, h: 38 }] },
];
export const layoutOf = (id: string): LayoutDef => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[1];

export const FONTS = ['Inter', 'Segoe UI', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New'] as const;
export interface TextStyle { font: string; size: number; bold: boolean; italic: boolean; color: string; align: 'left' | 'center' | 'right' }
export const SIZE_MIN = 8;
export const SIZE_MAX = 96;

export interface Block {
  id: string;
  kind: 'text' | 'image';
  text?: string;
  style?: TextStyle;
  src?: string; // picture of a dashboard card, chart, table or grid, as a data address
  caption?: string;
  capturedOn?: string; // YYYY-MM-DD: the numbers are as they were on this day
  live?: LiveRef; // where the picture came from, so it can be taken again when the deck is presented
  refreshFailedOn?: string; // YYYY-MM-DD: the last try to refresh it did not find the card (the old picture stays)
  frozen?: boolean; // the person chose to keep this picture as it is: it is never refreshed
  compare?: boolean; // the right-hand picture of a comparison slide: the same card from the last frozen copy of the deck
}
/** Which card a live picture came from: the page it was on, the card's heading, and which card with that heading (0 = first). */
export interface LiveRef { page: string; title: string; nth: number }
export interface Slide { id: string; layout: LayoutId; title: string; titleStyle: TextStyle; blocks: Block[]; bg: string; notes: string }
/** A logo and a footer line shown on every slide of the deck. */
export interface Brand { logo: string; footer: string; showLogo: boolean; showFooter: boolean }
export type Mode = 'latest' | 'static';
export const AUDIENCES = ['Management', 'Sales managers', 'Sales reps', 'Finance and others'] as const;
export interface Deck {
  id: string; name: string; slides: Slide[]; seconds: number; updatedOn: string; brand: Brand;
  mode: Mode; // latest: live pictures are retaken when presented; static: nothing ever changes
  audience: string; periodKind: '' | 'week' | 'month'; period: string; // who it is for, and which week or month
  folder: string; tags: string[]; pinned: boolean; lastOpened: string;
  autoCopy: boolean; // a latest deck saves a dated static copy of the older numbers before it refreshes
  showMeta: boolean; // audience and period on the title slide
  frozenFrom?: string; frozenOn?: string; auto?: boolean; // a static copy: the deck it came from, the day, and whether the app made it
}
export const deckExtras = (): Pick<Deck, 'mode' | 'audience' | 'periodKind' | 'period' | 'folder' | 'tags' | 'pinned' | 'lastOpened' | 'autoCopy' | 'showMeta'> =>
  ({ mode: 'latest', audience: '', periodKind: '', period: '', folder: '', tags: [], pinned: false, lastOpened: '', autoCopy: true, showMeta: true });

export const emptyBrand = (): Brand => ({ logo: '', footer: '', showLogo: true, showFooter: true });

let counter = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const titleStyle = (): TextStyle => ({ font: 'Inter', size: 30, bold: true, italic: false, color: '#14202e', align: 'left' });
export const bodyStyle = (): TextStyle => ({ font: 'Inter', size: 20, bold: false, italic: false, color: '#14202e', align: 'left' });

export const SIGNOFF_TEXT = '1. Decision: ____   Owner: ____   Due: ____\n2. Decision: ____   Owner: ____   Due: ____\n3. Decision: ____   Owner: ____   Due: ____\n4. Decision: ____   Owner: ____   Due: ____';

export function newSlide(layout: LayoutId = 'one'): Slide {
  const title = layout === 'title';
  const section = layout === 'section';
  const text = (t: string, style = bodyStyle()): Block => ({ id: newId('b'), kind: 'text', text: t, style });
  return { id: newId('s'), layout, title: title ? 'Presentation title' : section ? 'Section title' : layout === 'agenda' ? 'Agenda' : layout === 'signoff' ? 'Decisions and actions' : layout === 'compare' ? 'This period and last period' : 'Slide title',
    titleStyle: title || section ? { ...titleStyle(), size: title ? 44 : 40, align: 'center' } : titleStyle(),
    blocks: layout === 'title' ? [text('Subtitle or date', { ...bodyStyle(), align: 'center', size: 22 })]
      : layout === 'text' ? [text('Type your text here')] : layout === 'agenda' ? [text('Add slides, then press “Fill from slide titles”.')]
      : layout === 'signoff' ? [text(SIGNOFF_TEXT)] : [],
    bg: section ? '#e8f1fa' : '#ffffff', notes: '' };
}

export function newDeck(name: string): Deck {
  return { id: newId('d'), name: name.trim().slice(0, 80) || 'New presentation', slides: [newSlide('title')], seconds: 0, updatedOn: today(), brand: emptyBrand(), ...deckExtras() };
}

export const today = () => new Date().toISOString().slice(0, 10);

/** How many pictures/text blocks the layout can show. */
export const capacity = (layout: LayoutId) => layoutOf(layout).regions.length;

/** Blocks that do not fit the layout are kept (they come back if the layout changes back) but not shown. */
export const hiddenCount = (s: Slide) => Math.max(0, s.blocks.length - capacity(s.layout));

export function addBlock(s: Slide, b: Block): Slide {
  return { ...s, blocks: [...s.blocks, b] };
}

/** Puts a captured picture on the first slide with room for it, else on a new "One picture" slide at the end. */
export function placePicture(deck: Deck, block: Block, title: string, slideId?: string): { deck: Deck; slideId: string } {
  const target = deck.slides.find((s) => s.id === slideId && s.blocks.length < capacity(s.layout) && s.layout !== 'text' && s.layout !== 'title');
  if (target) {
    const slides = deck.slides.map((s) => (s.id === target.id ? addBlock(s, block) : s));
    return { deck: { ...deck, slides, updatedOn: today() }, slideId: target.id };
  }
  const slide = { ...addBlock(newSlide('one'), block), title: title.slice(0, 120) || 'Slide title' };
  return { deck: { ...deck, slides: [...deck.slides, slide], updatedOn: today() }, slideId: slide.id };
}

export function changeLayout(s: Slide, layout: LayoutId): Slide {
  return { ...s, layout };
}

export function moveSlide(d: Deck, index: number, by: -1 | 1): Deck {
  const to = index + by;
  if (index < 0 || index >= d.slides.length || to < 0 || to >= d.slides.length) return d;
  const slides = d.slides.slice();
  [slides[index], slides[to]] = [slides[to], slides[index]];
  return { ...d, slides };
}

export function duplicateSlide(d: Deck, index: number): Deck {
  const s = d.slides[index];
  if (!s) return d;
  const copy: Slide = { ...s, id: newId('s'), blocks: s.blocks.map((b) => ({ ...b, id: newId('b') })) };
  const slides = d.slides.slice();
  slides.splice(index + 1, 0, copy);
  return { ...d, slides };
}

export function removeSlide(d: Deck, index: number): Deck {
  if (d.slides.length <= 1) return d; // a deck always keeps one slide
  return { ...d, slides: d.slides.filter((_, i) => i !== index) };
}

export function duplicateDeck(d: Deck): Deck {
  return { ...d, id: newId('d'), name: `${d.name} (copy)`.slice(0, 80), brand: { ...d.brand }, tags: [...d.tags], pinned: false, frozenFrom: undefined, frozenOn: undefined, auto: undefined, slides: d.slides.map((s) => ({ ...s, id: newId('s'), blocks: s.blocks.map((b) => ({ ...b, id: newId('b') })) })), updatedOn: today() };
}

export const clampSize = (n: number) => Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(Number.isFinite(n) ? n : 20)));
export const clampSeconds = (n: number) => (n > 0 ? Math.max(2, Math.min(120, Math.round(n))) : 0);

// ---- reading a stored deck: anything damaged falls back to a safe value ----
const COLOR = /^#[0-9a-fA-F]{6}$/;
const styleOk = (x: unknown, fallback: TextStyle): TextStyle => {
  const s = (x && typeof x === 'object' ? x : {}) as Partial<TextStyle>;
  return { font: (FONTS as readonly string[]).includes(s.font ?? '') ? s.font! : fallback.font, size: clampSize(Number(s.size ?? fallback.size)),
    bold: typeof s.bold === 'boolean' ? s.bold : fallback.bold, italic: typeof s.italic === 'boolean' ? s.italic : fallback.italic,
    color: COLOR.test(s.color ?? '') ? s.color! : fallback.color, align: s.align === 'center' || s.align === 'right' ? s.align : 'left' };
};
const liveOk = (x: unknown): LiveRef | undefined => {
  const l = x as LiveRef;
  return l && typeof l === 'object' && typeof l.page === 'string' && typeof l.title === 'string' && l.page && l.title
    ? { page: l.page.slice(0, 200), title: l.title.slice(0, 200), nth: Math.max(0, Math.min(50, Math.floor(Number(l.nth) || 0))) } : undefined;
};
const brandOk = (x: unknown): Brand => {
  const b = (x && typeof x === 'object' ? x : {}) as Partial<Brand>;
  return { logo: typeof b.logo === 'string' && b.logo.startsWith('data:image/') && b.logo.length < 600_000 ? b.logo : '',
    footer: typeof b.footer === 'string' ? b.footer.slice(0, 120) : '', showLogo: b.showLogo !== false, showFooter: b.showFooter !== false };
};
export function parseDeck(raw: unknown): Deck | null {
  const d = raw as Deck;
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !Array.isArray(d.slides)) return null;
  const slides: Slide[] = d.slides.filter((s) => s && typeof s === 'object').map((s) => ({
    id: typeof s.id === 'string' ? s.id : newId('s'), layout: LAYOUTS.some((l) => l.id === s.layout) ? s.layout : 'one',
    title: typeof s.title === 'string' ? s.title.slice(0, 200) : '', titleStyle: styleOk(s.titleStyle, titleStyle()),
    bg: COLOR.test(s.bg ?? '') ? s.bg : '#ffffff', notes: typeof s.notes === 'string' ? s.notes.slice(0, 5000) : '',
    blocks: (Array.isArray(s.blocks) ? s.blocks : []).filter((b) => b && (b.kind === 'text' || b.kind === 'image')).map((b) => ({
      id: typeof b.id === 'string' ? b.id : newId('b'), kind: b.kind, text: typeof b.text === 'string' ? b.text.slice(0, 5000) : undefined,
      style: b.kind === 'text' ? styleOk(b.style, bodyStyle()) : undefined,
      src: typeof b.src === 'string' && b.src.startsWith('data:image/') ? b.src : undefined,
      caption: typeof b.caption === 'string' ? b.caption.slice(0, 200) : undefined,
      capturedOn: typeof b.capturedOn === 'string' ? b.capturedOn.slice(0, 10) : undefined, compare: b.compare === true ? true : undefined,
      live: liveOk(b.live), frozen: b.frozen === true ? true : undefined, refreshFailedOn: typeof b.refreshFailedOn === 'string' ? b.refreshFailedOn.slice(0, 10) : undefined })),
  }));
  if (!slides.length) return null;
  return { id: d.id, name: typeof d.name === 'string' ? d.name.slice(0, 80) : 'Presentation', slides, seconds: clampSeconds(Number(d.seconds)),
    updatedOn: typeof d.updatedOn === 'string' ? d.updatedOn.slice(0, 10) : today(), brand: brandOk(d.brand),
    mode: d.mode === 'static' ? 'static' : 'latest', audience: typeof d.audience === 'string' ? d.audience.slice(0, 40) : '',
    periodKind: d.periodKind === 'week' || d.periodKind === 'month' ? d.periodKind : '', period: typeof d.period === 'string' ? d.period.slice(0, 40) : '',
    folder: typeof d.folder === 'string' ? d.folder.slice(0, 40) : '', tags: Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string').map((t) => t.slice(0, 30)).slice(0, 10) : [],
    pinned: d.pinned === true, lastOpened: typeof d.lastOpened === 'string' ? d.lastOpened.slice(0, 24) : '', autoCopy: d.autoCopy !== false, showMeta: d.showMeta !== false,
    frozenFrom: typeof d.frozenFrom === 'string' ? d.frozenFrom : undefined, frozenOn: typeof d.frozenOn === 'string' ? d.frozenOn.slice(0, 10) : undefined,
    auto: d.auto === true ? true : undefined };
}

/** Live pictures of a deck, grouped by the page they came from. */
export function liveBlocks(d: Deck): { slideId: string; block: Block }[] {
  if (d.mode === 'static') return [];
  return d.slides.flatMap((s) => s.blocks.filter((b) => b.kind === 'image' && b.live && !b.frozen && !b.compare).map((block) => ({ slideId: s.id, block })));
}

/** Puts a freshly taken picture into a deck (or marks that the card was not found, keeping the old picture). */
export function applyRefresh(d: Deck, blockId: string, src: string | null, on: string): Deck {
  return { ...d, slides: d.slides.map((s) => ({ ...s, blocks: s.blocks.map((b) => (b.id !== blockId ? b
    : src ? { ...b, src, capturedOn: on, refreshFailedOn: undefined } : { ...b, refreshFailedOn: on })) })) };
}

// ---- starter decks: titles and hints only, the person adds their own cards and charts ----
export interface Template { id: string; name: string; about: string; slides: { layout: LayoutId; title: string; text?: string }[] }
export const TEMPLATES: Template[] = [
  { id: 'monthly', name: 'Monthly sales review', about: 'Title, headline numbers, sales trend, top customers and products, next steps.', slides: [
    { layout: 'title', title: 'Monthly sales review', text: 'Month and year' }, { layout: 'agenda', title: 'Agenda' },
    { layout: 'grid4', title: 'Headline numbers' }, { layout: 'one', title: 'Sales trend' }, { layout: 'compare', title: 'This month and last frozen copy' },
    { layout: 'two', title: 'Top customers and products' },
    { layout: 'text', title: 'What went well and what did not', text: 'Wins:\n\nProblems:' }, { layout: 'signoff', title: 'Decisions and actions' }] },
  { id: 'field', name: 'Weekly field team review', about: 'Visits, orders and collections for the team, then follow-ups.', slides: [
    { layout: 'title', title: 'Field team weekly review', text: 'Week of' }, { layout: 'agenda', title: 'Agenda' },
    { layout: 'two', title: 'Visits and orders' }, { layout: 'one', title: 'Team performance against target' },
    { layout: 'text-image', title: 'Notes from the field', text: 'Key points from this week' }, { layout: 'signoff', title: 'Follow-ups and owners' }] },
  { id: 'product', name: 'Product and customer review', about: 'Product movement, customer groups and stock, with a closing summary.', slides: [
    { layout: 'title', title: 'Product and customer review', text: 'Period' },
    { layout: 'section', title: 'Products' }, { layout: 'one', title: 'Product sales' }, { layout: 'section', title: 'Customers and stock' },
    { layout: 'two', title: 'Customer groups' }, { layout: 'one', title: 'Stock position' },
    { layout: 'text', title: 'Summary', text: 'Three things to remember' }] },
];

export function deckFromTemplate(t: Template, name?: string): Deck {
  const slides = t.slides.map((x) => {
    const s = newSlide(x.layout);
    s.title = x.title;
    if (x.text && (x.layout === 'title' || x.layout === 'text' || x.layout === 'text-image')) {
      const style = x.layout === 'title' ? { ...bodyStyle(), align: 'center' as const, size: 22 } : bodyStyle();
      s.blocks = [{ id: newId('b'), kind: 'text', text: x.text, style }];
    }
    return s;
  });
  return { id: newId('d'), name: (name || t.name).trim().slice(0, 80) || t.name, slides, seconds: 0, updatedOn: today(), brand: emptyBrand(), ...deckExtras() };
}
