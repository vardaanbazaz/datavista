import type { WindowFunctionType, WindowOrderBy } from "@/shared/services/window/types";

// Function types whose result is undefined/meaningless without an explicit row
// sequence: RANK/DENSE_RANK/PERCENT_RANK collapse to a single tied rank (arePeers
// treats every row as a peer with no orderBy — see functions.ts), and
// FIRST_VALUE/LAST_VALUE/RUNNING_TOTAL/MOVING_AVG/WINDOW_MIN/WINDOW_MAX all collapse
// to one dataset-wide constant repeated on every row (resolveFrameBounds's
// no-orderBy fallback spans the whole partition for every row — see engine.ts).
// Confirmed empirically in window/__tests__. ROW_NUMBER/NTILE/LAG/LEAD are excluded:
// they stay well-defined (positional on the dataset's existing row order) without
// an explicit order, so ordering is optional for them.
export const ORDER_BY_REQUIRED_REASONS: Partial<Record<WindowFunctionType, string>> = {
  RANK: "RANK requires Order By to define row sequence — without it every row ties for rank 1.",
  DENSE_RANK: "DENSE_RANK requires Order By to define row sequence — without it every row ties for rank 1.",
  PERCENT_RANK: "PERCENT_RANK requires Order By to define row sequence — without it every row collapses to 0.",
  FIRST_VALUE: "FIRST_VALUE requires Order By to define row sequence — without it every row returns the same arbitrary row's value.",
  LAST_VALUE: "LAST_VALUE requires Order By to define row sequence — without it every row returns the same arbitrary row's value.",
  RUNNING_TOTAL: "RUNNING_TOTAL requires Order By to define row sequence — without it every row shows the same dataset-wide total.",
  MOVING_AVG: "MOVING_AVG requires Order By to define row sequence — without it every row shows the same dataset-wide average.",
  WINDOW_MIN: "WINDOW_MIN requires Order By to define row sequence — without it every row shows the same dataset-wide minimum.",
  WINDOW_MAX: "WINDOW_MAX requires Order By to define row sequence — without it every row shows the same dataset-wide maximum.",
};

/** Whether Add Column must stay disabled: functionType requires ordering and none is set. */
export function isOrderByMissing(functionType: WindowFunctionType, orderBy: WindowOrderBy[]): boolean {
  return !!ORDER_BY_REQUIRED_REASONS[functionType] && orderBy.length === 0;
}
