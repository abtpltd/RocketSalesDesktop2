// Column order for grids, kept per person on this computer. Pure helpers so they can be tested.

interface Col { key?: unknown; fixed?: unknown }
const keyOf = (c: Col) => (c.key == null ? '' : String(c.key));
const movable = (c: Col) => !!keyOf(c) && !c.fixed;

/**
 * The columns in the person's saved order. Columns the saved order does not know (new on the server) keep their
 * place after the known ones; columns pinned to an edge (fixed) or without a key stay where the page put them.
 */
export function orderColumns<C extends Col>(cols: C[], order: string[] | undefined): C[] {
  if (!order || !order.length) return cols;
  const free = cols.filter(movable);
  const byKey = new Map(free.map((c) => [keyOf(c), c]));
  const known = order.filter((k, i) => byKey.has(k) && order.indexOf(k) === i).map((k) => byKey.get(k)!);
  const sorted = [...known, ...free.filter((c) => !known.includes(c))];
  let n = 0;
  return cols.map((c) => (movable(c) ? sorted[n++] : c));
}

/** Moves column `from` to where column `to` is (before it when moving left, after it when moving right). */
export function moveColumn(current: string[], from: string, to: string): string[] {
  const i = current.indexOf(from), j = current.indexOf(to);
  if (i < 0 || j < 0 || i === j) return current;
  const next = current.filter((k) => k !== from);
  next.splice(j, 0, from);
  return next;
}

/** True when the order is the page's own (nothing to reset). */
export const isDefaultOrder = (keys: string[], order: string[] | undefined) =>
  !order || !order.length || orderColumns(keys.map((key) => ({ key })), order).every((c, i) => c.key === keys[i]);
