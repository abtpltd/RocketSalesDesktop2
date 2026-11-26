import { describe, expect, it } from 'vitest';
import type { ProdRow, ProdTrap } from '../../api/types';
import { changeFor, groupTraps, moveText, moveTone, pickedRows, ratioTone, setMust, toggleCompare, weakestText } from './productivityMath';

const row = (code: string, weakest: ProdRow['weakest'] = ''): ProdRow => ({
  key: code, rep: code, code, calls: 10, doctor_calls: 0, productive: 5, orders: 5, order_days: 5, lines: 20, sales: 1000, strike: 50, lpc: 4, vpl: 50, aov: 200,
  weakest, levers: [{ key: 'lpc', label: 'Lines per call', value: 4, team: 5, ratio: 0.8, gain: 250 }],
});

describe('productivity helpers', () => {
  it('words the move against last month', () => {
    expect(moveText(12.34)).toBe('+12.3%');
    expect(moveText(-3)).toBe('-3%');
    expect(moveText(2, 'pts')).toBe('+2 pts');
    expect(moveText(0)).toBe('no change');
    expect(moveText(null)).toBe('');
    expect(moveTone(5)).toBe('ok'); expect(moveTone(-1)).toBe('bad'); expect(moveTone(null)).toBe('none');
    expect(changeFor({ sales: 10, calls: null, lpc: null, vpl: null, aov: null, strike: 3 }, 'strike')).toBe('+3 pts');
    expect(changeFor(null, 'sales')).toBe('');
  });
  it('colours a lever against the team', () => {
    expect([ratioTone(1.2), ratioTone(0.85), ratioTone(0.5), ratioTone(null)]).toEqual(['ok', 'w', 'b', 'none']);
  });
  it('limits the comparison to four reps and keeps the order picked', () => {
    let p: string[] = [];
    for (const c of ['A', 'B', 'C', 'D', 'E']) p = toggleCompare(p, c);
    expect(p).toEqual(['A', 'B', 'C', 'D']);
    expect(toggleCompare(p, 'B')).toEqual(['A', 'C', 'D']);
    expect(pickedRows([row('A'), row('B')], ['B', 'Z', 'A']).map((r) => r.code)).toEqual(['B', 'A']);
  });
  it('says the weakest link in words', () => {
    expect(weakestText(row('A', 'lpc'))).toContain('Lines per call');
    expect(weakestText(row('A', 'lpc'))).toContain('250');
    expect(weakestText(row('A'))).toContain('every lever');
  });
  it('groups traps per rep, most first', () => {
    const t = (code: string, trap: string): ProdTrap => ({ rep: code, code, trap, title: '', detail: '' });
    const g = groupTraps([t('B', 'x'), t('A', 'x'), t('A', 'y')]);
    expect(g.map((x) => [x.code, x.items.length])).toEqual([['A', 2], ['B', 1]]);
  });
  it('keeps the must-sell list unique and capped', () => {
    expect(setMust([' a', 'a', '', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });
});
