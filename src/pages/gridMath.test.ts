import { describe, expect, it } from 'vitest';
import { cellValue, gridTotal } from './gridMath';

describe('grids', () => {
  const rows = [{ id: 'P1', price: 12, qty: 2, value: 24 }, { id: 'P2', price: 5, qty: 0, value: 0 }];
  it('shows changed values and keeps the line value in step', () => {
    expect(cellValue(rows[0], 'qty', { P1: { qty: 3 } })).toBe(3);
    expect(cellValue(rows[0], 'value', { P1: { qty: 3 } })).toBe(36);
    expect(cellValue(rows[1], 'value', {})).toBe(0);
  });
  it('adds up the target value', () => {
    expect(gridTotal(rows, {})).toBe(24);
    expect(gridTotal(rows, { P2: { qty: 4 } })).toBe(44);
  });
});
