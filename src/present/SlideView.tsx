import type { CSSProperties } from 'react';
import { layoutOf, type Block, type Brand, type Deck, type Slide, type TextStyle } from './model';
import { deckBadge, metaLine, pictureBadge } from './modes';

const BASE_WIDTH = 960; // font sizes are written for a 960 px wide slide and scale with the width shown

const css = (s: TextStyle, scale: number): CSSProperties => ({
  fontFamily: `"${s.font}", system-ui, sans-serif`, fontSize: s.size * scale, fontWeight: s.bold ? 700 : 400,
  fontStyle: s.italic ? 'italic' : 'normal', color: s.color, textAlign: s.align, lineHeight: 1.25,
});

/** One slide at a given width (16:9). Used by the editor, the thumbnails, the player and the PDF export. */
export default function SlideView({ slide, width, selected, onSelect, brand: brandProp, deck }: {
  slide: Slide; width: number; selected?: string; onSelect?: (what: 'title' | string) => void; brand?: Brand; deck?: Deck;
}) {
  const brand = brandProp ?? deck?.brand;
  const L = layoutOf(slide.layout);
  const scale = width / BASE_WIDTH;
  const pos = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({
    position: 'absolute', left: `${r.x}%`, top: `${(r.y / 56.25) * 100}%`, width: `${r.w}%`, height: `${(r.h / 56.25) * 100}%`,
  });
  const ring = (on: boolean): CSSProperties => (on ? { outline: '2px solid #1370b6', outlineOffset: 2 } : {});
  return (
    <div className="slide-view" style={{ position: 'relative', width, height: (width * 9) / 16, background: slide.bg, overflow: 'hidden' }}>
      {L.title && (
        <div onClick={onSelect ? () => onSelect('title') : undefined} style={{ ...pos(L.title), ...css(slide.titleStyle, scale), ...ring(selected === 'title'),
          display: 'flex', alignItems: 'center', justifyContent: slide.titleStyle.align === 'center' ? 'center' : slide.titleStyle.align === 'right' ? 'flex-end' : 'flex-start',
          cursor: onSelect ? 'pointer' : 'default', overflow: 'hidden' }}>
          <span>{slide.title}</span>
        </div>
      )}
      {L.regions.map((r, i) => {
        const b: Block | undefined = slide.blocks[i];
        if (!b) return onSelect ? <div key={`e${i}`} style={{ ...pos(r), border: `${Math.max(1, scale)}px dashed #9fb2c5`, borderRadius: 6 * scale, color: '#9fb2c5',
          display: 'grid', placeItems: 'center', fontSize: 14 * scale, fontFamily: 'Inter, sans-serif', textAlign: 'center', padding: 6 * scale }}>{slide.layout === 'compare' && i === 1 ? 'Last frozen copy appears here (Update comparison)' : 'Empty'}</div> : null;
        return (
          <div key={b.id} onClick={onSelect ? () => onSelect(b.id) : undefined} style={{ ...pos(r), ...ring(selected === b.id), cursor: onSelect ? 'pointer' : 'default', overflow: 'hidden' }}>
            {b.kind === 'image'
              ? <figure style={{ margin: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {b.src && <img src={b.src} alt={b.caption || 'Dashboard picture'} style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'contain' }} />}
                {(b.capturedOn || deck) && <figcaption style={{ fontSize: 10 * scale, color: b.compare ? '#8a5a00' : '#627081', fontFamily: 'Inter, sans-serif', textAlign: 'right', letterSpacing: 0.2 }}>
                  {deck ? pictureBadge(deck, b) : `As of ${b.capturedOn}`}</figcaption>}
              </figure>
              : <div style={{ ...css(b.style!, scale), whiteSpace: 'pre-wrap', overflow: 'hidden', height: '100%' }}>{b.text}</div>}
          </div>
        );
      })}
      {deck && deck.showMeta && slide.layout === 'title' && metaLine(deck) && (
        <div style={{ position: 'absolute', left: '8%', width: '84%', top: `${(46 / 56.25) * 100}%`, textAlign: 'center', fontSize: 16 * scale, color: '#627081', fontFamily: 'Inter, sans-serif' }}>{metaLine(deck)}</div>
      )}
      {deck && (
        <div style={{ position: 'absolute', right: '1.5%', top: '0.5%', fontSize: 8.5 * scale, lineHeight: 1.4, padding: `0 ${5 * scale}px`, borderRadius: 3 * scale, fontFamily: 'Inter, sans-serif',
          letterSpacing: 0.3, fontWeight: 600, color: deck.mode === 'static' ? '#8a5a00' : '#0b5a96', background: deck.mode === 'static' ? '#fdf1d8' : '#e1effa' }}>{deckBadge(deck)}</div>
      )}
      {brand && brand.showFooter && brand.footer && (
        <div style={{ position: 'absolute', left: '4%', bottom: '1.2%', maxWidth: '70%', fontSize: 11 * scale, color: '#627081', fontFamily: 'Inter, sans-serif',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brand.footer}</div>
      )}
      {brand && brand.showLogo && brand.logo && (
        <img src={brand.logo} alt="" style={{ position: 'absolute', right: '3%', bottom: '0.8%', height: '5.6%', maxWidth: '18%', objectFit: 'contain' }} />
      )}
    </div>
  );
}
