import { describe, expect, it } from 'vitest';
import { screenClass, suggest } from './screenFit';

describe('screen fit', () => {
  it('classes screens by CSS pixels', () => {
    expect(screenClass(1280, 720)).toBe('compact');
    expect(screenClass(1366, 768)).toBe('standard');
    expect(screenClass(1920, 1080)).toBe('wide');
    expect(screenClass(2560, 1440)).toBe('ultra');
    expect(screenClass(1920, 600)).toBe('compact'); // short window or screen
  });
  it('suggests a bigger size on big screens and Normal on small ones', () => {
    expect(suggest(1920, 1080, 'normal', [])?.size).toBe('large');
    expect(suggest(2560, 1440, 'normal', [])?.size).toBe('larger');
    expect(suggest(1280, 720, 'larger', [])?.size).toBe('normal');
  });
  it('stays quiet when the size already fits or the person already answered for this kind of screen', () => {
    expect(suggest(1920, 1080, 'large', [])).toBeNull();
    expect(suggest(1920, 1080, 'normal', ['wide'])).toBeNull();
    expect(suggest(1920, 1080, 'normal', ['compact'])?.cls).toBe('wide'); // another kind of screen asks again
  });
});
