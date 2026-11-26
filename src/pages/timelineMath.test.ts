import { describe, expect, it } from 'vitest';
import { barBox, dayLabel, hourTicks, lengthText, place } from './timelineMath';

describe('timeline arithmetic', () => {
  it('places times like the web script: (time - start) / width * 100', () => {
    expect(place(540, 360, 1080)).toBeCloseTo(25);
    expect(place(360, 360, 1080)).toBe(0);
    expect(place(100, 360, 360)).toBe(0);
  });
  it('draws a bar for a visit and a dot when it has no end', () => {
    const bar = barBox(540, 570, 360, 1080)!;
    expect(bar.left).toBeCloseTo(25);
    expect(bar.width).toBeCloseTo((30 / 720) * 100);
    expect(bar.dot).toBe(false);
    expect(barBox(540, null, 360, 1080)!.dot).toBe(true);
    expect(barBox(540, 540, 360, 1080)!.dot).toBe(true);
    expect(barBox(null, 570, 360, 1080)).toBeNull();
  });
  it('thins hour labels on a long day', () => {
    const short = hourTicks(360, 1080);
    expect(short).toHaveLength(12);
    expect(short.every((t) => t.label)).toBe(true);
    const long = hourTicks(0, 1440, 12);
    expect(long.filter((t) => t.label)).toHaveLength(12);
    expect(long[0].label).toBe('00:00');
  });
  it('formats lengths and day labels', () => {
    expect(lengthText(0)).toBe('0 m');
    expect(lengthText(20)).toBe('20 m');
    expect(lengthText(65)).toBe('1 h 05 m');
    expect(dayLabel('05-10-2026')).toContain('05-10-2026');
  });
});
