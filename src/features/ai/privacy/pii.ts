/**
 * Personal-data guard: which columns look like emails, phone numbers or person names, by
 * column name and by value pattern. Over-masking is the safe failure (the user can unmask a
 * column); numeric and date columns are never flagged by value, so amounts, IDs and dates
 * stay usable.
 */
export type PiiKind = "email" | "phone" | "name";

const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_CHARS = /^\+?[\d\s().-]{7,22}$/;
const DATE_LIKE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})([ T].*)?$/;
const NAME_TOKEN = /^[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?\.?$/;

const EMAIL_NAME = /e-?mail/i;
const PHONE_NAME = /phone|mobile|\bcell\b|telephone|\btel\b|whats\s*app|contact[\s_-]*(no|number)/i;
/** Column names that hold a person's name. "Product name", "App name" etc. do not match. */
const PERSON_NAME =
  /^(full[\s_-]*)?name$|^(first|last|middle|given|family|sur|nick|user|display|full)[\s_-]*name$|^surname$|^(customer|client|employee|patient|student|contact|person|owner|manager|agent|applicant|member|candidate|user|author|recipient|sender|guest|passenger|driver|teacher|doctor|staff|emp)[\s_-]*(full[\s_-]*)?name$/i;

function nonBlankStrings(values: unknown[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) out.push(s);
  }
  return out;
}

export function looksLikePhone(value: string): boolean {
  if (!PHONE_CHARS.test(value) || DATE_LIKE.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  if (digits < 7 || digits > 15) return false;
  // A bare run of digits is more often an ID or amount than a phone, unless it is a
  // 10-digit mobile number or carries a leading +.
  const hasSeparator = /[\s().-]/.test(value) || value.startsWith("+");
  return hasSeparator || /^[6-9]\d{9}$/.test(value);
}

export function looksLikePersonName(value: string): boolean {
  const tokens = value.split(/\s+/);
  return tokens.length >= 2 && tokens.length <= 4 && tokens.every((t) => NAME_TOKEN.test(t));
}

/**
 * Classifies one column. `values` is a sample of its cells (a few hundred is plenty);
 * `type` is the effective column type.
 */
export function detectPii(columnName: string, type: string, values: unknown[]): PiiKind | null {
  if (EMAIL_NAME.test(columnName)) return "email";
  if (PHONE_NAME.test(columnName)) return "phone";
  if (PERSON_NAME.test(columnName.trim())) return "name";
  if (type === "numeric" || type === "date") return null;

  const sample = nonBlankStrings(values).slice(0, 300);
  if (sample.length === 0) return null;
  const share = (test: (s: string) => boolean) => sample.filter(test).length / sample.length;
  if (share((s) => EMAIL_VALUE.test(s)) >= 0.5) return "email";
  if (share(looksLikePhone) >= 0.6) return "phone";
  const distinct = new Set(sample).size / sample.length;
  if (distinct >= 0.8 && share(looksLikePersonName) >= 0.6) return "name";
  return null;
}

export function maskToken(kind: PiiKind): string {
  return `[masked ${kind}]`;
}
