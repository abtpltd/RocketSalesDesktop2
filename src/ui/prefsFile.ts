// Screen settings that survive a new installer: everything the screen keeps in its own storage (theme, text size,
// saved dashboard views, grid columns and filters, recent pages...) is also copied to a file in the app data folder
// (src-tauri/core/src/prefs.rs). At start the file fills in whatever the screen's storage lost; afterwards every change
// is copied to the file a moment later. If the file cannot be read or written, the screen works as before.

export interface PrefsBackend {
  load(): Promise<Record<string, string>>;
  save(prefs: Record<string, string>): Promise<void>;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export function snapshot(store: Store): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k == null) continue;
    const v = store.getItem(k);
    if (v != null) out[k] = v;
  }
  return out;
}

/** Puts back saved settings the store does not have (the store wins when it has a value). Returns how many. */
export function fillIn(store: Store, saved: Record<string, string>, set: (k: string, v: string) => void): number {
  let n = 0;
  for (const [k, v] of Object.entries(saved ?? {})) {
    if (typeof v === 'string' && store.getItem(k) === null) { set(k, v); n += 1; }
  }
  return n;
}

/**
 * Calls onChange after setItem / removeItem / clear on this one store (other stores, like sessionStorage, are not
 * touched). Returns the original setItem, for restoring without echoing back.
 */
export function watchStore(store: Storage, proto: Storage, onChange: () => void): (k: string, v: string) => void {
  const set = proto.setItem, remove = proto.removeItem, clear = proto.clear;
  proto.setItem = function (this: Storage, k: string, v: string) { set.call(this, k, v); if (this === store) onChange(); };
  proto.removeItem = function (this: Storage, k: string) { remove.call(this, k); if (this === store) onChange(); };
  proto.clear = function (this: Storage) { clear.call(this); if (this === store) onChange(); };
  return (k, v) => set.call(store, k, v);
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

/** At app start: restore from the file, then keep the file up to date. Never throws and never waits long. */
export async function keepPrefs(backend: PrefsBackend, delayMs = 600): Promise<void> {
  let store: Storage;
  try { store = window.localStorage; void store.length; } catch { return; } // storage blocked: nothing to keep
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { backend.save(snapshot(store)).catch(() => undefined); }, delayMs);
  };
  const set = watchStore(store, Object.getPrototypeOf(store) as Storage, changed);
  try {
    const saved = await withTimeout(backend.load(), 1500);
    if (fillIn(store, saved, set) > 0) changed(); // keep the file in step with what was restored
    else if (!Object.keys(saved ?? {}).length && store.length) changed(); // first run with a new app: start the file
  } catch {
    /* the file is optional */
  }
}
