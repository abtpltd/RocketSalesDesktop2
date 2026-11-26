/** What the sign-in screen remembers on this computer: the company logo and the last person who signed in. */
import type { Brand } from '../api/types';

const BRAND = 'company-brand';
const LAST_USER = 'last-user';

const read = <T,>(key: string): T | null => { try { const t = localStorage.getItem(key); return t ? (JSON.parse(t) as T) : null; } catch { return null; } };
const write = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* optional */ } };

export interface SavedBrand extends Brand { domain: string }
export interface LastUser { domain: string; name: string; email: string }

const norm = (c: string) => c.trim().toLowerCase();

/** The saved logo, only for the company it belongs to. */
export function savedBrand(company: string): SavedBrand | null {
  const b = read<SavedBrand>(BRAND);
  return b && company && b.domain === norm(company) ? b : null;
}
export const saveBrand = (company: string, b: Brand) => write(BRAND, { ...b, domain: norm(company) });

export function lastUser(company: string): LastUser | null {
  const u = read<LastUser>(LAST_USER);
  return u && company && u.domain === norm(company) ? u : null;
}
export const saveLastUser = (company: string, name: string, email: string) => write(LAST_USER, { domain: norm(company), name, email });

/** "Good morning" before noon, "Good afternoon" until 5 pm, then "Good evening", by this computer's clock. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** The first name, for a friendlier welcome ("Hemant Patel" -> "Hemant"). */
export const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] ?? '';

/** Reads a picked file as a data: address (the app's security policy allows data: images, not blob: ones). */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error('The image could not be read.'));
    r.readAsDataURL(file);
  });
}

/** Shrinks a picked image to fit 480 x 160 and returns a PNG or WebP data URL under the server's 200 KB limit. */
export async function shrinkLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|bmp|svg\+xml)$/.test(file.type)) throw new Error('Pick a PNG, JPEG or WebP image.');
  const src = await readAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('The image could not be read.')); i.src = src;
  });
  const w = img.naturalWidth || 480; const h = img.naturalHeight || 160;
  const scale = Math.min(1, 480 / w, 160 / h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const g = canvas.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const [type, q] of [['image/png', undefined], ['image/webp', 0.92], ['image/webp', 0.8]] as const) {
    const data = canvas.toDataURL(type, q);
    if (data.startsWith(`data:${type};`) && data.length * 0.75 < 190 * 1024) return data;
  }
  throw new Error('The logo is too large. Use a simpler image.');
}
