import { describe, expect, it } from 'vitest';
import { changedFlags, moveItem } from './trainingMath';

describe('training and app user settings', () => {
  it('moves items and ignores moves off the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
  it('sends only the flags that changed', () => {
    expect(changedFlags({ doSales: true, doOrder: false }, { doSales: true, doOrder: true })).toEqual({ doOrder: true });
  });
});
