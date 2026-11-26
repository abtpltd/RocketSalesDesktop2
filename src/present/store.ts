// Decks are kept in this browser engine's IndexedDB (pictures are too big for the small settings file), one database
// per person and company. If IndexedDB is not available the decks live in memory for the session only.
import { parseDeck, type Deck } from './model';

export const dbName = (company: string, email: string) => `present|${company.toLowerCase()}|${email.toLowerCase()}`;

export interface DeckStore {
  list(): Promise<Deck[]>;
  save(d: Deck): Promise<void>;
  remove(id: string): Promise<void>;
}

export function memoryStore(): DeckStore {
  const m = new Map<string, Deck>();
  return {
    async list() { return [...m.values()].sort((a, b) => b.updatedOn.localeCompare(a.updatedOn)); },
    async save(d) { m.set(d.id, JSON.parse(JSON.stringify(d))); },
    async remove(id) { m.delete(id); },
  };
}

export function idbStore(name: string): DeckStore {
  if (typeof indexedDB === 'undefined') return memoryStore();
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('decks', { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const run = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const req = f(db.transaction('decks', mode).objectStore('decks'));
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  };
  return {
    async list() {
      const all = (await run('readonly', (s) => s.getAll())) as unknown[];
      return all.map(parseDeck).filter((d): d is Deck => !!d).sort((a, b) => b.updatedOn.localeCompare(a.updatedOn));
    },
    async save(d) { await run('readwrite', (s) => s.put(d)); },
    async remove(id) { await run('readwrite', (s) => s.delete(id)); },
  };
}
