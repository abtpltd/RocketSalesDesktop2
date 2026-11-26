import { describe, expect, it } from 'vitest';
import { isDefaultOrder, moveColumn, orderColumns } from './gridOrder';

const cols = (...k: string[]) => k.map((key) => ({ key }));
const keys = (c: { key?: unknown }[]) => c.map((x) => String(x.key));

describe('grid column order', () => {
  it('keeps the page order when nothing is saved', () => {
    expect(keys(orderColumns(cols('a', 'b', 'c'), undefined))).toEqual(['a', 'b', 'c']);
    expect(keys(orderColumns(cols('a', 'b', 'c'), []))).toEqual(['a', 'b', 'c']);
  });
  it('uses the saved order, unknown saved keys ignored, new columns after the known ones', () => {
    expect(keys(orderColumns(cols('a', 'b', 'c', 'd'), ['c', 'gone', 'a']))).toEqual(['c', 'a', 'b', 'd']);
  });
  it('leaves fixed and key-less columns where the page put them', () => {
    const list = [{ key: 'sel', fixed: 'left' }, { key: 'a' }, { key: 'b' }, {}, { key: 'act', fixed: 'right' }];
    expect(orderColumns(list, ['b', 'a', 'act', 'sel']).map((c) => c.key ?? '-')).toEqual(['sel', 'b', 'a', '-', 'act']);
  });
  it('ignores repeated keys in a damaged saved order', () => {
    expect(keys(orderColumns(cols('a', 'b'), ['b', 'b', 'a']))).toEqual(['b', 'a']);
  });
  it('moves a column before or after its target', () => {
    expect(moveColumn(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveColumn(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveColumn(['a', 'b'], 'a', 'x')).toEqual(['a', 'b']);
  });
  it('knows when the order is the page default', () => {
    expect(isDefaultOrder(['a', 'b'], undefined)).toBe(true);
    expect(isDefaultOrder(['a', 'b'], ['a', 'b', 'x'])).toBe(true);
    expect(isDefaultOrder(['a', 'b'], ['b'])).toBe(false);
  });
});
