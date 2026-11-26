import { describe, expect, it } from 'vitest';
import { fillIn, snapshot, watchStore } from './prefsFile';

class MemStore {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe('screen settings kept in a file', () => {
  it('fills in only what the store lost, and copies every change', () => {
    const store = new MemStore() as unknown as Storage;
    const other = new MemStore() as unknown as Storage;
    let changes = 0;
    const set = watchStore(store, MemStore.prototype as unknown as Storage, () => { changes += 1; });
    store.setItem('ui-theme', 'ocean');
    expect(changes).toBe(1);
    other.setItem('x', '1'); // another store (like sessionStorage) does not count
    expect(changes).toBe(1);
    const n = fillIn(store, { 'ui-theme': 'sunset', 'dash-view|a': '{"order":[]}' }, set);
    expect(n).toBe(1);
    expect(store.getItem('ui-theme')).toBe('ocean'); // what the screen has wins
    expect(store.getItem('dash-view|a')).toBe('{"order":[]}');
    expect(changes).toBe(1); // restoring is not echoed back
    store.removeItem('ui-theme');
    expect(changes).toBe(2);
    expect(snapshot(store)).toEqual({ 'dash-view|a': '{"order":[]}' });
  });
});
