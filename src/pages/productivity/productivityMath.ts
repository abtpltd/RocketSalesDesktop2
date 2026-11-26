import type { ProdChange, ProdLeverKey, ProdRow, ProdTrap } from '../../api/types';

export const LEVER_WORDS: Record<ProdLeverKey, { label: string; hint: string }> = {
  calls: { label: 'Calls', hint: 'Visit more outlets' },
  strike: { label: 'Strike rate', hint: 'Turn more visits into orders' },
  lpc: { label: 'Lines per call', hint: 'Sell more products in each order' },
  vpl: { label: 'Value per line', hint: 'Sell more of each product' },
};

export const TRAP_WORDS: Record<string, string> = {
  easy_outlets: 'Easy outlets only', thin_baskets: 'Thin baskets', tiny_orders: 'Tiny orders', key_outlets: 'Best outlets missed',
};

export const num = (v: number | null | undefined, digits = 1): string =>
  (v == null ? '–' : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
export const pct = (v: number | null | undefined): string => (v == null ? '–' : `${num(v, 0)}%`);
export const money = (v: number | null | undefined): string => (v == null ? '–' : Math.round(v).toLocaleString());

/** "+12%" / "-3%" / "+2 pts" for the move against last month; '' when there is nothing to compare. */
export function moveText(v: number | null | undefined, unit: '%' | 'pts' = '%'): string {
  if (v == null || !Number.isFinite(v)) return '';
  const r = Math.round(v * 10) / 10;
  if (r === 0) return 'no change';
  return `${r > 0 ? '+' : ''}${num(r, 1)}${unit === '%' ? '%' : ' pts'}`;
}
export const moveTone = (v: number | null | undefined): 'ok' | 'bad' | 'none' => (v == null || Math.round(v * 10) === 0 ? 'none' : v > 0 ? 'ok' : 'bad');

/** Colour of a lever against the team: green at or above the team, amber from 80%, red below. */
export function ratioTone(ratio: number | null | undefined): 'ok' | 'w' | 'b' | 'none' {
  if (ratio == null) return 'none';
  return ratio >= 1 ? 'ok' : ratio >= 0.8 ? 'w' : 'b';
}

export const MAX_COMPARE = 4;
export function toggleCompare(picked: string[], code: string): string[] {
  if (picked.includes(code)) return picked.filter((c) => c !== code);
  return picked.length >= MAX_COMPARE ? picked : [...picked, code];
}
export function pickedRows(rows: ProdRow[], picked: string[]): ProdRow[] {
  const by = new Map(rows.map((r) => [r.code, r]));
  return picked.map((c) => by.get(c)).filter((r): r is ProdRow => !!r);
}

/** The lever with the biggest sales gain for a rep, as words. */
export function weakestText(r: ProdRow): string {
  if (!r.weakest) return 'At or above the team on every lever';
  const lv = r.levers.find((l) => l.key === r.weakest);
  const w = LEVER_WORDS[r.weakest];
  return lv ? `${w.label}: ${w.hint.toLowerCase()} (up to ${money(lv.gain)} more sales)` : w.label;
}

export function groupTraps(traps: ProdTrap[]): { rep: string; code: string; items: ProdTrap[] }[] {
  const out = new Map<string, { rep: string; code: string; items: ProdTrap[] }>();
  for (const t of traps) {
    const g = out.get(t.code) ?? { rep: t.rep, code: t.code, items: [] };
    g.items.push(t);
    out.set(t.code, g);
  }
  return [...out.values()].sort((a, b) => b.items.length - a.items.length || a.rep.localeCompare(b.rep));
}

export function changeFor(c: ProdChange | null | undefined, key: 'sales' | 'calls' | 'strike' | 'lpc' | 'vpl'): string {
  return c ? moveText(c[key], key === 'strike' ? 'pts' : '%') : '';
}

/** The must-sell list after a tick: no duplicates, at most `max`. */
export function setMust(codes: string[], max: number): string[] {
  return [...new Set(codes.map((c) => c.trim()).filter(Boolean))].slice(0, max);
}
