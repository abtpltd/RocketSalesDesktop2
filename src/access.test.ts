import { describe, expect, it } from 'vitest';
import { canDo } from './access';

describe('desktop access', () => {
  const access = { pages: { '/master/Client': ['view', 'export'] as const }, settings: { offline: true, classic: false }, limited: true };
  it('only limits pages the rules list', () => {
    expect(canDo(access as never, '/master/Client', 'export')).toBe(true);
    expect(canDo(access as never, '/master/Client?x=1', 'create')).toBe(false);
    expect(canDo(access as never, '/Other', 'delete')).toBe(true);
    expect(canDo(undefined, '/master/Client', 'create')).toBe(true);
    expect(canDo({ ...access, limited: false } as never, '/master/Client', 'create')).toBe(true);
  });
});
