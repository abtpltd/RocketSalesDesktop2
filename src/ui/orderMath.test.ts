import { describe, expect, it } from 'vitest';
import { parseQty, priceLine, sumLines } from './orderMath';

const line = { code: 'P3', name: 'Zinc', uom: 'BOX', uc: 12, qty: '1.6', rate: 99, discount: 0, tax: 16, act_wt: 0.5 };

describe('order editor arithmetic (same as the web script and the server)', () => {
  it('reads main.sub quantities and rolls pieces over', () => {
    expect(parseQty('2.5', 10)).toEqual({ text: '2.5', q1: 2, q2: 5 });
    expect(parseQty('2.15', 10)).toEqual({ text: '3.5', q1: 3, q2: 5 });
    expect(parseQty('x', 10)).toBeNull();
    expect(parseQty('', 10)).toBeNull();
  });
  it('prices a line with tax included', () => {
    const p = priceLine(line, 1, 6);
    expect(p.total).toBe(148.5);
    expect(p.sb_amt).toBe(128.0172);
    expect(p.tax_amt).toBe(20.4828);
    const s = sumLines([p, priceLine({ ...line, rate: 50, discount: 10, tax: 0, uc: 1 }, 3, 0)]);
    expect(s.gt.toFixed(2)).toBe('283.50');
  });
});
