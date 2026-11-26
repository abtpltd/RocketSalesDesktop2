// PowerPoint file of a deck, made on this computer with the free open-source pptxgenjs library.
// Each slide keeps its title and text boxes as real, editable PowerPoint text; pictures of cards, charts and tables are pictures.
import PptxGenJS from 'pptxgenjs';
import { layoutOf, type Deck, type Region, type TextStyle } from './model';
import { deckBadge, metaLine, pictureBadge } from './modes';

const U = 0.1; // one layout unit (the layout is 100 x 56.25) is 0.1 inch on a 10 x 5.625 inch slide
const box = (r: Region) => ({ x: r.x * U, y: r.y * U, w: r.w * U, h: r.h * U });
const hex = (c: string) => c.replace('#', '').toUpperCase();
const font = (s: TextStyle) => ({ fontFace: s.font, fontSize: Math.round(s.size * 0.75), bold: s.bold, italic: s.italic, color: hex(s.color), align: s.align });

/** The deck as a .pptx, returned as base64. */
export async function deckToPptx(deck: Deck): Promise<string> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9'; // 10 x 5.625 in
  pptx.title = deck.name;
  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(s.bg) };
    const L = layoutOf(s.layout);
    if (L.title && s.title) slide.addText(s.title, { ...box(L.title), ...font(s.titleStyle), valign: 'middle', fit: 'shrink', margin: 0 });
    L.regions.forEach((r, i) => {
      const b = s.blocks[i];
      if (!b) return;
      if (b.kind === 'text') {
        slide.addText(b.text ?? '', { ...box(r), ...font(b.style!), valign: 'top', fit: 'shrink', margin: 0 });
      } else if (b.src) {
        const area = box(r);
        const note = 0.18;
        slide.addImage({ data: b.src, x: area.x, y: area.y, w: area.w, h: area.h - note, sizing: { type: 'contain', w: area.w, h: area.h - note } });
        slide.addText(pictureBadge(deck, b), { x: area.x, y: area.y + area.h - note, w: area.w, h: note, fontSize: 8, color: b.compare ? '8A5A00' : '627081', align: 'right', margin: 0 });
      }
    });
    slide.addText(deckBadge(deck), { x: 6.8, y: 0.03, w: 3.1, h: 0.16, fontSize: 7, bold: true, color: deck.mode === 'static' ? '8A5A00' : '0B5A96', align: 'right', margin: 0 });
    if (deck.showMeta && s.layout === 'title' && metaLine(deck)) slide.addText(metaLine(deck), { x: 0.8, y: 4.6, w: 8.4, h: 0.3, fontSize: 12, color: '627081', align: 'center', margin: 0 });
    if (deck.brand.showFooter && deck.brand.footer) slide.addText(deck.brand.footer, { x: 0.4, y: 5.3, w: 6.5, h: 0.25, fontSize: 8, color: '627081', margin: 0 });
    if (deck.brand.showLogo && deck.brand.logo) slide.addImage({ data: deck.brand.logo, x: 8.2, y: 5.27, w: 1.6, h: 0.3, sizing: { type: 'contain', w: 1.6, h: 0.3 } });
    if (s.notes.trim()) slide.addNotes(s.notes);
  }
  return (await pptx.write({ outputType: 'base64' })) as string;
}
