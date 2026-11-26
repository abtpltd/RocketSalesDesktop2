import { describe, expect, it } from 'vitest';
import { MAX_TABS, arrangeTabs, nextActive, openTab, togglePin } from './PageTabs';

describe('page tabs', () => {
  it('adds once, caps the count and keeps the dashboard', () => {
    expect(openTab(['dashboard', 'orders'], 'orders')).toEqual(['dashboard', 'orders']);
    let t = ['dashboard'];
    for (let i = 0; i < 15; i += 1) t = openTab(t, `p${i}`);
    expect(t).toHaveLength(MAX_TABS);
    expect(t[0]).toBe('dashboard');
    expect(t[t.length - 1]).toBe('p14');
  });
  it('picks a neighbour after closing', () => {
    expect(nextActive(['dashboard', 'a', 'b'], 'a')).toBe('b');
    expect(nextActive(['dashboard', 'a', 'b'], 'b')).toBe('a');
    expect(nextActive(['a'], 'a')).toBe('dashboard');
  });
  it('never closes a pinned tab to make room, and pinned tabs do not count', () => {
    let t = ['dashboard', 'pin1'];
    for (let i = 0; i < 15; i += 1) t = openTab(t, `p${i}`, ['pin1']);
    expect(t).toContain('pin1');
    expect(t.filter((x) => x !== 'pin1')).toHaveLength(MAX_TABS);
  });
  it('puts pinned tabs right after the dashboard, in pin order', () => {
    expect(arrangeTabs(['dashboard', 'a', 'b', 'c'], ['c', 'a', 'gone'])).toEqual(['dashboard', 'c', 'a', 'b']);
    expect(togglePin(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePin(['a', 'b'], 'a')).toEqual(['b']);
  });
});
