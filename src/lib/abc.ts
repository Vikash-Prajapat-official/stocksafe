// ABC analysis. Pure. Integer maths only (shares are in basis points: 10000 = 100%).

export type AbcInput = { id: string; name?: string; value: number };
export type AbcClass = "A" | "B" | "C";
export type AbcRow = {
  id: string;
  rank: number;
  value: number;
  /** This item's share of the total value, in basis points. */
  shareBp: number;
  /** Running share including this item, in basis points. */
  cumulativeBp: number;
  class: AbcClass;
};

/**
 * Ranks items by consumption value (largest first) and classes them: A while the items before it make up less
 * than `a`% of the total (so the item that crosses the line is still A), B up to `b`%, C for the rest.
 * Items with no consumption are C. Ties are broken by name, then id, so the result is repeatable.
 */
export function abcClassify(items: readonly AbcInput[], limits: { a: number; b: number } = { a: 80, b: 95 }): AbcRow[] {
  const sorted = items
    .map((i) => ({ id: i.id, name: i.name ?? i.id, value: Math.max(0, i.value) }))
    .sort((x, y) => y.value - x.value || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const total = sorted.reduce((s, i) => s + i.value, 0);

  let before = 0;
  return sorted.map((i, idx) => {
    const after = before + i.value;
    let cls: AbcClass = "C";
    if (total > 0) {
      if (before * 100 < limits.a * total) cls = "A";
      else if (before * 100 < limits.b * total) cls = "B";
    }
    const row: AbcRow = {
      id: i.id,
      rank: idx + 1,
      value: i.value,
      shareBp: total > 0 ? Math.round((i.value * 10000) / total) : 0,
      cumulativeBp: total > 0 ? Math.round((after * 10000) / total) : 0,
      class: cls,
    };
    before = after;
    return row;
  });
}
