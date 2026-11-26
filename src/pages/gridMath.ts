/** Changed cells per row id. */
export type Changes = Record<string, Record<string, number | string>>;
type Row = { id: string } & Record<string, unknown>;

/** The value shown in a cell: the change when there is one; an itemized line's value follows its quantity. */
export function cellValue(row: Row, key: string, changes: Changes): unknown {
  const ch = changes[row.id];
  if (ch && key in ch) return ch[key];
  if (key === 'value' && ch && 'qty' in ch) return Math.round(Number(row.price ?? 0) * Number(ch.qty) * 100) / 100;
  return row[key];
}

/** Itemized targets: the total value, as the web page adds it up (price x quantity of every line above 0). */
export function gridTotal(rows: Row[], changes: Changes): number {
  return rows.reduce((sum, r) => {
    const qty = Number(cellValue(r, 'qty', changes) ?? 0);
    return qty > 0 ? sum + qty * Number(r.price ?? 0) : sum;
  }, 0);
}
