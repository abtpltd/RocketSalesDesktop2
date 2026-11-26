import { describe, expect, it } from 'vitest';
import { priceRows } from './priceMath';

describe('price list file', () => {
  it('reads AMOUNT, or the exclusive price of a web download', () => {
    expect(priceRows([['WHOLESALE'], ['Product Code', 'Amount'], ['p1', '1,200'], ['p2', 'x'], ['p1', 5], ['', 3]]))
      .toEqual({ rows: [{ code: 'P1', rate: 1200 }], problems: ['Line 3: P2 has no valid rate, left out.', 'Line 4: P1 is repeated, left out.'] });
    expect(priceRows([['PRODUCT CODE', 'PRODUCT NAME', 'INCLUSIVE PRICE', 'EXCLUSIVE PRICE'], ['A', 'x', 116, 100]]).rows).toEqual([{ code: 'A', rate: 100 }]);
    expect(priceRows([['CODE', 'AMOUNT']]).problems[0]).toContain('PRODUCT CODE');
  });
});
