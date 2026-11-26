import { describe, expect, it } from 'vitest';
import { graceLeft, idleLimitMs, isBlockedKey, names, offlineTooLong, shouldLock } from './guardLogic';

describe('guard rules', () => {
  it('locks after the idle time, sooner on a saved offline copy, never full screen', () => {
    expect(shouldLock(9 * 60_000, 0, false, false)).toBe(false);
    expect(shouldLock(10 * 60_000, 0, false, false)).toBe(true);
    expect(shouldLock(5 * 60_000, 0, true, false)).toBe(true);
    expect(shouldLock(60 * 60_000, 0, false, true)).toBe(false);
    expect(idleLimitMs(true)).toBeLessThan(idleLimitMs(false));
  });
  it('asks for the password after a long offline stay', () => {
    expect(offlineTooLong(1000, 0)).toBe(false);
    expect(offlineTooLong(11 * 3_600_000, 1)).toBe(false);
    expect(offlineTooLong(13 * 3_600_000, 1)).toBe(true);
  });
  it('counts the grace time down', () => {
    expect(graceLeft(1000, 1000)).toBe(30);
    expect(graceLeft(1000, 11_000)).toBe(20);
    expect(graceLeft(1000, 99_000)).toBe(0);
  });
  it('lists each tool once', () => {
    expect(names([{ kind: 'capture', name: 'OBS' }, { kind: 'capture', name: 'OBS' }])).toEqual(['OBS']);
  });
  it('blocks print, save, copy keys', () => {
    expect(isBlockedKey({ key: 'p', ctrlKey: true, metaKey: false })).toBe(true);
    expect(isBlockedKey({ key: 'PrintScreen', ctrlKey: false, metaKey: false })).toBe(true);
    expect(isBlockedKey({ key: 'p', ctrlKey: false, metaKey: false })).toBe(false);
  });
});
