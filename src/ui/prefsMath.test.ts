import { beforeEach, describe, expect, it } from 'vitest';
import { decodeRange, encodeRange, putView, readJson, writeJson } from './prefsMath';

const T = new Date(2026, 9, 25);
describe('saved filters', () => {
  it('keeps common ranges relative', () => {
    expect(encodeRange('2026-10-25', '2026-10-25', T)).toEqual({ mode: 'today' });
    expect(encodeRange('2026-10-01', '2026-10-31', T)).toEqual({ mode: 'this_month' });
    expect(encodeRange('2026-10-19', '2026-10-25', T)).toEqual({ mode: 'last_7' });
    expect(encodeRange('2026-09-01', '2026-09-30', T)).toEqual({ mode: 'fixed', from: '2026-09-01', to: '2026-09-30' });
    expect(encodeRange('', '', T)).toEqual({ mode: 'none' });
    expect(decodeRange({ mode: 'this_month' }, new Date(2026, 1, 3))).toEqual(['2026-02-01', '2026-02-28']);
    expect(decodeRange({ mode: 'fixed', from: '2026-09-30', to: '2026-09-01' }, T)).toBeNull();
    expect(decodeRange(undefined, T)).toBeNull();
  });
  it('replaces by name and caps the list', () => {
    let v = putView([], { name: 'Mine', range: { mode: 'none' }, filters: { a: 1 } });
    v = putView(v, { name: 'mine ', range: { mode: 'today' }, filters: { a: 2 } });
    expect(v).toHaveLength(1);
    expect(v[0].filters).toEqual({ a: 2 });
    expect(putView(v, { name: '  ', range: { mode: 'none' }, filters: { a: 0 } })).toBe(v);
  });
});

describe('stored preferences', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => { m.set(k, x); } };
  });
  it('falls back on broken or wrong values', () => {
    writeJson('k', { size: 'small' });
    expect(readJson('k', null, (v) => typeof v === 'object')).toEqual({ size: 'small' });
    localStorage.setItem('bad', '{oops');
    expect(readJson('bad', 'x', () => true)).toBe('x');
    expect(readJson('k', 'x', (v) => Array.isArray(v))).toBe('x');
  });
});
