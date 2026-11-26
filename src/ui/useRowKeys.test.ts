import { describe, expect, it } from 'vitest';
import { moveRow } from './useRowKeys';

describe('row keys', () => {
  it('moves within the rows and ignores other keys', () => {
    expect(moveRow('ArrowDown', -1, 5)).toBe(0);
    expect(moveRow('ArrowDown', 4, 5)).toBe(4);
    expect(moveRow('k', 2, 5)).toBe(1);
    expect(moveRow('End', 0, 5)).toBe(4);
    expect(moveRow('x', 0, 5)).toBeNull();
    expect(moveRow('ArrowDown', -1, 0)).toBeNull();
  });
});
