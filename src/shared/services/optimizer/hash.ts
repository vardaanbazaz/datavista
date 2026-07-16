/**
 * Recursively stringifies an object sorting its keys to ensure stability.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return "";
  if (typeof obj !== "object") return String(obj);

  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return "{" + keys.map(k => `${k}:${stableStringify(record[k])}`).join(",") + "}";
}

/**
 * Deterministically hashes a query object using FNV-1a 32-bit algorithm.
 */
export function hashQuery(query: unknown): string {
  const serialized = stableStringify(query);
  
  let hval = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i++) {
    hval ^= serialized.charCodeAt(i);
    hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
  }
  
  return (hval >>> 0).toString(16);
}
