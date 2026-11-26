import { describe, expect, it } from 'vitest';
import { canDo } from './access';
import type { DesktopAccess } from './api/types';

const acc = (pages: Record<string, string[]>): DesktopAccess => ({ limited: true, v: 2, pages, settings: {}, assigned: true } as unknown as DesktopAccess);

describe('desktop-only pages use the rights of the page they go with', () => {
  it('Rockey Settings follows Rockey User when the server did not list it', () => {
    const a = acc({ '/master/MobileVanUser': ['view', 'edit'] });
    expect(canDo(a, '/RocketSalesSettings', 'view')).toBe(true);
    expect(canDo(a, '/RocketSalesSettings', 'edit')).toBe(true);
    expect(canDo(a, '/RocketSalesSettings', 'delete')).toBe(false);
  });
  it('a role that may only look at Rockey User may only look at Rockey Settings', () => {
    const a = acc({ '/master/MobileVanUser': ['view'] });
    expect(canDo(a, '/RocketSalesSettings', 'edit')).toBe(false);
  });
  it('a role without Rockey User gets nothing; a listed entry wins', () => {
    expect(canDo(acc({ '/master/Product': ['view'] }), '/RocketSalesSettings', 'view')).toBe(false);
    expect(canDo(acc({ '/master/MobileVanUser': ['view', 'edit'], '/RocketSalesSettings': ['view'] }), '/RocketSalesSettings', 'edit')).toBe(false);
  });
});
