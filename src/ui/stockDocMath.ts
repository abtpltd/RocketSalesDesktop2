/** Line rules for Stock IN and allocations, as on the web pages (the server checks them again). */
export interface DocRow { key: string; item: string; name: string; qty: number; from?: string; to?: string }

const whole = (qty: number | null): number | null => {
  const n = Number(qty);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
};

/** Adds an item to a Stock IN; each item once. Returns the new rows or a message. */
export function addStockIn(rows: DocRow[], item: string, name: string, qty: number | null): DocRow[] | string {
  const q = whole(qty);
  if (q == null) return 'Enter a whole quantity of 1 or more.';
  if (rows.some((r) => r.item === item)) return `${name} is already in the list. Change its quantity instead.`;
  return [...rows, { key: `${item}-${rows.length}-${Date.now()}`, item, name, qty: q }];
}

/** Adds an item for each chosen rep; the same item goes to a rep only once (names compared without case). */
export function addAllocation(rows: DocRow[], item: string, name: string, qty: number | null, from: string, to: string[]): DocRow[] | string {
  const q = whole(qty);
  if (q == null) return 'Enter a whole quantity of 1 or more.';
  if (!from) return 'Choose where the stock comes from.';
  const reps = to.filter((r) => r && r.toLowerCase() !== from.toLowerCase());
  if (!reps.length) return 'Choose the rep(s) who receive it (not the giver).';
  const taken = reps.filter((r) => rows.some((x) => x.item === item && (x.to ?? '').toLowerCase() === r.toLowerCase()));
  if (taken.length) return `${name} is already assigned to ${taken.join(', ')}.`;
  const stamp = Date.now();
  return [...rows, ...reps.map((r, i) => ({ key: `${item}-${r}-${stamp}-${i}`, item, name, qty: q, from, to: r }))];
}
