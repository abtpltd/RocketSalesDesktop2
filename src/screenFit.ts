// Suggests the text size that usually fits a screen best. Sizes are in CSS pixels, which already include the
// Windows display scaling (a 4K screen at 150% reports 2560 wide), so the same rule works for every scaling.
import type { TextSize } from './theme';

export type ScreenClass = 'compact' | 'standard' | 'wide' | 'ultra';

export function screenClass(width: number, height: number): ScreenClass {
  if (width < 1366 || height < 720) return 'compact';
  if (width < 1920) return 'standard';
  if (width < 2560) return 'wide';
  return 'ultra';
}

const BEST: Record<ScreenClass, TextSize> = { compact: 'normal', standard: 'normal', wide: 'large', ultra: 'larger' };

export const CLASS_LABEL: Record<ScreenClass, string> = {
  compact: 'a small screen', standard: 'a standard screen', wide: 'a large screen', ultra: 'a very large screen',
};
export const SIZE_LABEL: Record<TextSize, string> = { normal: 'Normal (100%)', large: 'Large (110%)', larger: 'Larger (120%)' };

export interface Suggestion { cls: ScreenClass; size: TextSize; width: number; height: number }

/** The suggestion to show, or null when the current size already fits or this kind of screen was answered before. */
export function suggest(width: number, height: number, current: TextSize, answered: readonly string[]): Suggestion | null {
  const cls = screenClass(width, height);
  const size = BEST[cls];
  if (size === current || answered.includes(cls)) return null;
  return { cls, size, width: Math.round(width), height: Math.round(height) };
}

const KEY = 'ui-fit-answered';
export function readAnswered(): ScreenClass[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x): x is ScreenClass => ['compact', 'standard', 'wide', 'ultra'].includes(x)) : [];
  } catch { return []; }
}
export function remember(cls: ScreenClass): void {
  try { localStorage.setItem(KEY, JSON.stringify([...new Set([...readAnswered(), cls])])); } catch { /* optional */ }
}
