/** Moves one item up (-1) or down (+1); out-of-range moves leave the list as it is. */
export function moveItem<T>(items: T[], index: number, step: -1 | 1): T[] {
  const to = index + step;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** The flags that changed for one app user (only these are sent; the server fills in the rest from the record). */
export function changedFlags(saved: Record<string, unknown>, current: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(current)) if (Boolean(saved[k]) !== v) out[k] = v;
  return out;
}
