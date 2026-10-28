/**
 * Every top-level view the app can show. Single source of truth: ViewType is derived from
 * this list, and runtime checks (e.g. isValidUIState) read it, so adding a view here is
 * enough for it to be accepted everywhere.
 */
export const VIEW_TYPES = [
  'overview',
  'upload',
  'charts',
  'data',
  'filters',
  'export',
  'pivot',
  'stats',
  'window-builder',
] as const;

export type ViewType = (typeof VIEW_TYPES)[number];

export function isViewType(value: unknown): value is ViewType {
  return typeof value === 'string' && (VIEW_TYPES as readonly string[]).includes(value);
}
