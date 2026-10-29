import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Progress } from "@/shared/components/ui/progress";
import { Hint } from "@/shared/components/Hint";
import type { ImportIssuesSummary } from "@/shared/types";
import type { ImportStage, SheetChoice } from "@/features/upload/lib/importCore";
import { useImportStore } from "@/store/importStore";

const STAGES: { id: ImportStage; label: string }[] = [
  { id: "reading", label: "Reading file" },
  { id: "parsing", label: "Parsing" },
  { id: "analysing", label: "Analysing columns" },
  { id: "saving", label: "Saving" },
];

const ISSUES_SHOWN = 20;

/** Problem rows from an import: row number, problem and the raw values. Used at import and when reopened. */
export function ImportIssueList({ issues }: { issues: ImportIssuesSummary }) {
  const shown = issues.listed.slice(0, ISSUES_SHOWN);
  return (
    <div className="space-y-2">
      {issues.fileIssues.length > 0 && (
        <ul className="text-sm text-muted-foreground list-disc pl-5">
          {issues.fileIssues.map(m => <li key={m}>{m}</li>)}
        </ul>
      )}
      {shown.length > 0 && (
        <div className="max-h-64 overflow-auto rounded border border-border">
          <table className="w-full text-xs" data-testid="import-issue-table">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium">Row</th>
                <th className="text-left p-2 font-medium">Problem</th>
                <th className="text-left p-2 font-medium">Raw values</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((issue, i) => (
                <tr key={`${issue.row}-${i}`} className="border-t border-border align-top" data-testid="import-issue-row">
                  <td className="p-2 tabular-nums">{issue.row.toLocaleString()}</td>
                  <td className="p-2">{issue.message}</td>
                  <td className="p-2 font-mono break-all">{issue.raw.join(" | ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {issues.rowCount > shown.length && (
        <p className="text-xs text-muted-foreground">
          Showing the first {shown.length} of {issues.rowCount.toLocaleString()} rows with problems.
        </p>
      )}
    </div>
  );
}

function useTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(t => t + 1), 250);
    return () => clearInterval(id);
  }, [active]);
}

function ProgressView() {
  const { fileName, stage, fraction, startedAt, stageStartedAt, cancellable, cancel } = useImportStore();
  useTicker(true);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const stageElapsed = ((Date.now() - stageStartedAt) / 1000).toFixed(1);
  const current = STAGES.findIndex(s => s.id === stage);
  const percent = fraction === null ? null : Math.round(fraction * 100);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Importing {fileName}</DialogTitle>
        <DialogDescription>{elapsed} s elapsed</DialogDescription>
      </DialogHeader>
      <ol className="space-y-1 text-sm">
        {STAGES.map((s, i) => (
          <li
            key={s.id}
            data-testid={`import-stage-${s.id}`}
            data-state={i < current ? "done" : i === current ? "active" : "pending"}
            className={i === current ? "font-medium" : i < current ? "text-muted-foreground" : "text-muted-foreground/60"}
          >
            {i < current ? "✓ " : i === current ? "→ " : "  "}
            {s.label}
          </li>
        ))}
      </ol>
      <div className="space-y-1">
        <Progress value={percent ?? 0} className={percent === null ? "animate-pulse" : undefined} />
        <p className="text-sm text-muted-foreground" data-testid="import-progress-text">
          {STAGES[current]?.label}: {percent === null ? `working… ${stageElapsed} s` : `${percent}%`}
        </p>
      </div>
      <DialogFooter>
        <Hint label="Cancel import" disabledReason={cancellable ? undefined : "The dataset is being saved and can't be cancelled now"}>
          <Button variant="outline" onClick={cancel} disabled={!cancellable} data-testid="import-cancel">
            Cancel
          </Button>
        </Hint>
      </DialogFooter>
    </>
  );
}

function SheetPicker() {
  const { fileName, sheets, canAppend, answerSheet, cancel } = useImportStore();
  const firstWithRows = sheets.find(s => s.rowCount > 0)?.name ?? sheets[0]?.name ?? "";
  const [choice, setChoice] = useState<string>(firstWithRows);
  const selected: SheetChoice = choice === "\u0000append" ? { kind: "append" } : { kind: "one", name: choice };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Choose a sheet</DialogTitle>
        <DialogDescription>{fileName} has {sheets.length} sheets. Pick the one to import.</DialogDescription>
      </DialogHeader>
      <fieldset className="space-y-2 max-h-80 overflow-auto" data-testid="sheet-picker">
        <legend className="sr-only">Sheet</legend>
        {sheets.map(s => (
          <label key={s.name} className="flex gap-3 items-start rounded border border-border p-2 cursor-pointer">
            <input
              type="radio"
              name="import-sheet"
              className="mt-1"
              value={s.name}
              checked={choice === s.name}
              disabled={s.rowCount === 0}
              onChange={() => setChoice(s.name)}
              data-testid="sheet-option"
              aria-label={s.name}
            />
            <span className="min-w-0">
              <span className="font-medium">{s.name}</span>{" "}
              <span className="text-sm text-muted-foreground" data-testid="sheet-row-count">
                {s.rowCount.toLocaleString()} rows
              </span>
              <span className="block text-xs text-muted-foreground truncate" title={s.headers.join(", ")}>
                {s.headers.length > 0 ? s.headers.join(", ") : "Empty sheet"}
              </span>
            </span>
          </label>
        ))}
        {canAppend && (
          <label className="flex gap-3 items-start rounded border border-border p-2 cursor-pointer">
            <input
              type="radio"
              name="import-sheet"
              className="mt-1"
              checked={choice === "\u0000append"}
              onChange={() => setChoice("\u0000append")}
              data-testid="sheet-append"
              aria-label="Append all sheets"
            />
            <span>
              <span className="font-medium">Append all sheets</span>
              <span className="block text-xs text-muted-foreground">
                Every sheet has the same columns. Rows are stacked and a "Source sheet" column says where each came from.
              </span>
            </span>
          </label>
        )}
      </fieldset>
      <DialogFooter>
        <Button variant="outline" onClick={cancel}>Cancel</Button>
        <Button onClick={() => answerSheet(selected)} disabled={!choice} data-testid="sheet-import">Import</Button>
      </DialogFooter>
    </>
  );
}

function IssueReview() {
  const { review, answerReview, cancel } = useImportStore();
  if (!review) return null;
  const { issues } = review;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Import summary</DialogTitle>
        <DialogDescription data-testid="import-summary-counts">
          {review.rowCount.toLocaleString()} rows and {review.columnCount} columns read from {review.fileName}.{" "}
          {issues.rowCount.toLocaleString()} {issues.rowCount === 1 ? "row has" : "rows have"} parse problems.
          {review.duplicateRowCount > 0 &&
            ` ${review.duplicateRowCount.toLocaleString()} duplicate ${review.duplicateRowCount === 1 ? "row" : "rows"} (every column equal to an earlier row; you can remove them in the Data view).`}
        </DialogDescription>
      </DialogHeader>
      <ImportIssueList issues={issues} />
      <p className="text-xs text-muted-foreground">
        Kept rows are padded with blanks (too few fields) or cut to the header width (too many). This list stays available from the Data view.
      </p>
      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={cancel}>Cancel import</Button>
        <Button variant="outline" onClick={() => answerReview({ exclude: true })} data-testid="issues-exclude">
          Exclude {issues.rowCount.toLocaleString()} {issues.rowCount === 1 ? "row" : "rows"}
        </Button>
        <Button autoFocus onClick={() => answerReview({ exclude: false })} data-testid="issues-keep">
          Keep all rows
        </Button>
      </DialogFooter>
    </>
  );
}

/** The one import dialog: progress and cancel, the sheet picker, and the parse-problem summary. */
export function ImportDialog() {
  const phase = useImportStore(s => s.phase);
  const cancel = useImportStore(s => s.cancel);
  const answerReview = useImportStore(s => s.answerReview);
  const onOpenChange = (open: boolean) => {
    if (open) return;
    // Closing the summary keeps the rows (the default); closing anything else cancels.
    if (phase === "reviewing") answerReview({ exclude: false });
    else cancel();
  };
  return (
    <Dialog open={phase !== "idle"} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        data-testid="import-dialog"
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        {phase === "running" && <ProgressView />}
        {phase === "choosing-sheet" && <SheetPicker />}
        {phase === "reviewing" && <IssueReview />}
      </DialogContent>
    </Dialog>
  );
}

/** Reopens the summary stored in dataset metadata (read-only). */
export function ImportIssuesDialog({ issues, duplicateRowCount = 0, open, onOpenChange }: {
  issues: ImportIssuesSummary;
  /** metadata.quality.duplicateRowCount */
  duplicateRowCount?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="import-issues-dialog">
        <DialogHeader>
          <DialogTitle>Import summary</DialogTitle>
          <DialogDescription>
            {issues.rowCount.toLocaleString()} of {issues.sourceRowCount.toLocaleString()} rows had parse problems and{" "}
            {issues.excluded ? "were excluded at import" : "were kept"}.
            {issues.excluded ? "" : " To exclude them, import the file again and choose Exclude."}
            {duplicateRowCount > 0 && ` ${duplicateRowCount.toLocaleString()} duplicate ${duplicateRowCount === 1 ? "row" : "rows"}.`}
          </DialogDescription>
        </DialogHeader>
        <ImportIssueList issues={issues} />
      </DialogContent>
    </Dialog>
  );
}
