export type WindowFunctionType =
  | 'ROW_NUMBER'
  | 'RANK'
  | 'DENSE_RANK'
  | 'PERCENT_RANK'
  | 'NTILE'
  | 'LAG'
  | 'LEAD'
  | 'FIRST_VALUE'
  | 'LAST_VALUE'
  | 'MOVING_AVG'
  | 'RUNNING_TOTAL'
  | 'WINDOW_MIN'
  | 'WINDOW_MAX';

export interface WindowFrameBound {
  type: 'UNBOUNDED_PRECEDING' | 'CURRENT_ROW' | 'PRECEDING' | 'FOLLOWING' | 'UNBOUNDED_FOLLOWING';
  value?: number; // Used when type is PRECEDING or FOLLOWING
}

export interface WindowFrame {
  type: 'ROWS'; // SQL-style ROWS
  start: WindowFrameBound;
  end: WindowFrameBound;
}

export interface WindowOrderBy {
  column: string;
  direction: 'asc' | 'desc';
}

export interface WindowQuery {
  alias: string; // New column name
  functionType: WindowFunctionType;
  targetColumn?: string; // target value for aggregations/value functions
  partitionBy?: string[]; // columns to group by
  orderBy?: WindowOrderBy[]; // columns to sort by
  frame?: WindowFrame;
  offset?: number; // for LAG/LEAD
  defaultValue?: number | string | null; // for LAG/LEAD
  ntileGroups?: number; // for NTILE
}
