import { describe, expect, it } from 'vitest';
import { DARK_ON_PRIMARY, THEMES } from './theme';

describe('colour themes', () => {
  it('offers seven distinct themes with the logo blue first', () => {
    expect(THEMES).toHaveLength(7);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(7);
    expect(THEMES[0]).toMatchObject({ id: 'ocean', primary: '#1370b6' });
    for (const t of THEMES) for (const c of [t.primary, t.primaryDark, t.deep, t.side]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const AA = 4.5;

describe('every theme is readable (WCAG AA, 4.5:1)', () => {
  for (const t of THEMES) {
    it(t.name, () => {
      // light mode: button text on the colour, links and coloured text on cards and on the page background
      expect(contrast(t.onPrimary ?? '#ffffff', t.primary)).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.link ?? t.primary, '#ffffff')).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.link ?? t.primary, '#f3f6fa')).toBeGreaterThanOrEqual(AA);
      // dark mode: dark text on the bright colour, the colour on dark cards
      expect(contrast(DARK_ON_PRIMARY, t.primaryDark)).toBeGreaterThanOrEqual(AA);
      expect(contrast(t.primaryDark, '#13212f')).toBeGreaterThanOrEqual(AA);
      // the selected page in the side menu: white on the deep shade
      expect(contrast('#ffffff', t.deep)).toBeGreaterThanOrEqual(AA);
    });
  }
  it('grey secondary text', () => {
    expect(contrast('#627081', '#ffffff')).toBeGreaterThanOrEqual(AA);
    expect(contrast('#627081', '#f3f6fa')).toBeGreaterThanOrEqual(AA);
    expect(contrast('#8da0b5', '#13212f')).toBeGreaterThanOrEqual(AA);
  });
});
