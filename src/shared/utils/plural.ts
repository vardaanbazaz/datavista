/**
 * Count wording that agrees with the number: plural(1, "row") → "row", plural(3, "row") →
 * "rows", plural(1, "was", "were") → "was". Use for nouns and for the verb that follows them,
 * so "1 row was kept" / "2 rows were kept", never "1 row(s)" or "1 row … were".
 */
export function plural(n: number, one: string, many: string = `${one}s`): string {
  return n === 1 ? one : many;
}

/** "1 row", "1,234 rows", "1 duplicate row" (countOf(n, "duplicate row")). */
export function countOf(n: number, one: string, many?: string): string {
  return `${n.toLocaleString()} ${plural(n, one, many)}`;
}
