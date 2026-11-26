import { describe, expect, it } from 'vitest';
import { addAllocation, addStockIn, type DocRow } from './stockDocMath';

describe('stock documents', () => {
  it('stock in takes each item once with whole quantities', () => {
    const one = addStockIn([], 'G1', 'Pen', 5.7) as DocRow[];
    expect(one).toHaveLength(1);
    expect(one[0].qty).toBe(5);
    expect(addStockIn(one, 'G1', 'Pen', 2)).toMatch(/already/);
    expect(addStockIn(one, 'G2', 'Cap', 0)).toMatch(/whole/);
  });
  it('allocation adds one line per rep and refuses the same rep twice', () => {
    const rows = addAllocation([], 'G1', 'Pen', 3, 'GIFT STORE', ['Ann', 'Bob']) as DocRow[];
    expect(rows.map((r) => r.to)).toEqual(['Ann', 'Bob']);
    expect(addAllocation(rows, 'G1', 'Pen', 1, 'GIFT STORE', ['ann'])).toMatch(/already assigned to ann/);
    expect(addAllocation(rows, 'G2', 'Cap', 1, 'Ann', ['Ann'])).toMatch(/not the giver/);
    expect(addAllocation(rows, 'G2', 'Cap', 1, '', ['Ann'])).toMatch(/comes from/);
  });
});
