// Backup, restore and sharing of presentations as one file. The file can be locked with a password
// (AES-256-GCM, key from PBKDF2-SHA256), using the browser engine's own Web Crypto: no outside service.
import { newId, parseDeck, today, type Deck } from './model';

export const FORMAT = 'rocketsales-presentations';
const ITERATIONS = 200_000;

export class BackupError extends Error {
  constructor(public code: 'not_a_backup' | 'needs_password' | 'wrong_password' | 'empty', message: string) { super(message); }
}

const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

async function keyFrom(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** The file text for these decks. With a password the decks are locked; without one they are readable plain JSON. */
export async function packDecks(decks: Deck[], password = ''): Promise<string> {
  const body = JSON.stringify({ decks });
  if (!password) return JSON.stringify({ format: FORMAT, version: 1, enc: false, savedOn: today(), decks });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(password, salt), new TextEncoder().encode(body)));
  return JSON.stringify({ format: FORMAT, version: 1, enc: true, savedOn: today(), salt: b64(salt), iv: b64(iv), data: b64(data) });
}

/** Reads a file made by packDecks. Throws BackupError: not_a_backup, needs_password, wrong_password, empty. */
export async function unpackDecks(text: string, password = ''): Promise<Deck[]> {
  let f: { format?: string; enc?: boolean; decks?: unknown; salt?: string; iv?: string; data?: string };
  try { f = JSON.parse(text); } catch { throw new BackupError('not_a_backup', 'This is not a RocketSales presentations file.'); }
  if (!f || f.format !== FORMAT) throw new BackupError('not_a_backup', 'This is not a RocketSales presentations file.');
  let raw: unknown = f.decks;
  if (f.enc) {
    if (!password) throw new BackupError('needs_password', 'This file is locked. Enter its password.');
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv ?? '') as BufferSource },
        await keyFrom(password, unb64(f.salt ?? '')), unb64(f.data ?? '') as BufferSource);
      raw = (JSON.parse(new TextDecoder().decode(plain)) as { decks?: unknown }).decks;
    } catch { throw new BackupError('wrong_password', 'The password is wrong, or the file is damaged.'); }
  }
  const decks = (Array.isArray(raw) ? raw : []).map(parseDeck).filter((d): d is Deck => !!d);
  if (!decks.length) throw new BackupError('empty', 'There are no presentations in this file.');
  return decks;
}

export const isLocked = (text: string): boolean => { try { return JSON.parse(text)?.enc === true; } catch { return false; } };

/**
 * What to do with decks read from a file. The same deck already here and unchanged is skipped; the same deck changed on
 * either side, or a deck from someone else, is added as a new copy, so nothing here is ever overwritten.
 */
export function planImport(existing: Deck[], incoming: Deck[]): { add: Deck[]; skipped: number } {
  const add: Deck[] = []; let skipped = 0;
  for (const d of incoming) {
    const same = existing.find((e) => e.id === d.id);
    if (same && JSON.stringify(same) === JSON.stringify(d)) { skipped++; continue; }
    if (!same) { add.push(d); continue; }
    add.push({ ...d, id: newId('d'), name: `${d.name} (imported)`.slice(0, 80), slides: d.slides.map((s) => ({ ...s, id: newId('s'), blocks: s.blocks.map((b) => ({ ...b, id: newId('b') })) })) });
  }
  return { add, skipped };
}

/** The text as base64 (UTF-8), for saving through the app's file-save call. */
export const textToBase64 = (text: string): string => b64(new TextEncoder().encode(text));
export const backupName = (what: string) => `${what.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'presentations'}.rspres`;
