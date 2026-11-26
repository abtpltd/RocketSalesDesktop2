import { describe, expect, it } from 'vitest';
import { blankLine, groupLines, lineProblem, offerCodes } from './promoMath';

describe('app promo lines', () => {
  it('checks lines like the web add buttons', () => {
    expect(lineProblem('Item Slabs Rate', { c: 'P1', r: 5, fq: 1, tq: 10 })).toBeNull();
    expect(lineProblem('Item Slabs Rate', { c: 'P1', r: 5, fq: 11, tq: 10 })).toBe('Invalid Qty Range!');
    expect(lineProblem('Items Bundle Free', { c: [], sq: 1, oc: 'P2', oq: 1 })).toMatch(/product group/);
    expect(lineProblem('Item Slabs Free', blankLine('Item Slabs Free'))).toMatch(/Selling product/);
  });
  it('collects the product codes like prepareFinalDTA', () => {
    expect(offerCodes('Items Bundle Discount', [{ c: ['P1', 'P2'] }, { c: ['P2', 'P3'] }])).toEqual(['P1', 'P2', 'P3']);
    expect(offerCodes('Free Item Advance', [{ sc: 'P1', oc: 'P9' }])).toEqual(['P1']);
    expect(offerCodes('Item Slabs Rate', [{ c: 'P4' }, { c: 'P4' }])).toEqual(['P4']);
  });
  it('adds a line per product of the chosen groups', () => {
    expect(groupLines([{ c: 'P1', g: 'OTC' }, { c: 'P2', g: 'RX' }], ['OTC'], 1, 5, 3)).toEqual([{ c: 'P1', d: 3, fq: 1, tq: 5 }]);
  });
  it('starts new free-item lines at CTN', () => {
    expect(blankLine('Free Item Advance')).toEqual({ sc: '', oc: '', sq: 1, su: 'CTN', oq: 1, ou: 'CTN' });
  });
});
