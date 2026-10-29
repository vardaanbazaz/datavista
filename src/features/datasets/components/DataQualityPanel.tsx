import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import type { ColumnFix, ColumnMetadata, Dataset, ValueCount } from "@/shared/types";
import { useDatasetStore } from "@/store/datasetStore";
import { labelKey, suggestionKey, variantMergeText } from "@/shared/services/dataQuality";
import { previewNumberConversion } from "@/shared/services/columnFixes";
import { fixLabel } from "../lib/fixLabel";

/** Suggestions answered "No" this session (not stored: they come back after a reload). */
const answeredNo = new Set<string>();

/** Header badges for one column: applied fixes (with undo) and invalid values (with samples). */
export function ColumnQualityBadges({ dataset, column, meta, effectiveType }: {
  dataset: Dataset;
  column: string;
  meta: ColumnMetadata | undefined;
  effectiveType: string;
}) {
  const undoColumnFix = useDatasetStore((s) => s.undoColumnFix);
  const fixes = (dataset.metadata?.columnFixes ?? []).filter((f) => f.column === column);
  const quality = meta?.quality;
  const invalid = (effectiveType === "numeric" || effectiveType === "date") && quality ? quality.invalidCount : 0;
  return (
    <>
      {fixes.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Badge variant="outline" className="ml-1 text-[10px] normal-case font-normal cursor-pointer border-primary text-primary" data-testid={`fix-badge-${column}`}>
              {fixes.length === 1 ? fixLabel(fixes[0]).split(" (")[0] : `${fixes.length} fixes`} — undo
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-80 text-xs normal-case tracking-normal space-y-2">
            {fixes.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-2">
                <p>
                  <span className="font-semibold">{f.auto ? "On import: " : ""}</span>
                  {fixLabel(f)}. Original values are kept.
                </p>
                <Button size="sm" variant="outline" onClick={() => undoColumnFix(f.id)} data-testid={`undo-fix-${f.id}`}>
                  Undo
                </Button>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      )}
      {invalid > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Badge variant="outline" className="ml-1 text-[10px] normal-case font-normal cursor-pointer border-tertiary text-tertiary" data-testid={`invalid-badge-${column}`}>
              {invalid.toLocaleString()} invalid
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-72 text-xs normal-case tracking-normal" data-testid={`invalid-popover-${column}`}>
            <p className="font-semibold mb-1">
              {invalid.toLocaleString()} {invalid === 1 ? "value isn't a valid" : "values aren't valid"} {effectiveType === "date" ? "date" : "number"}
            </p>
            <p className="text-muted-foreground mb-2">They stay in the data as they are and are left out of every calculation.</p>
            <ul className="space-y-0.5 font-mono">
              {quality!.invalidSamples.map((s) => (
                <li key={s.value}>
                  {s.value} ×{s.count.toLocaleString()}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}

function VariantSuggestion({ column, group, onMerge, onNo, onNever }: {
  column: string;
  group: ValueCount[];
  onMerge: (target: string) => void;
  onNo: () => void;
  onNever: () => void;
}) {
  const [target, setTarget] = useState(group[0].value);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center" data-testid={`variant-suggestion-${column}`}>
      <p className="flex-1">
        <span className="font-semibold">{column}:</span> {variantMergeText(group, target)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="h-8 w-40" aria-label={`Merge target for ${column}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {group.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {g.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => onMerge(target)} data-testid={`merge-${column}`}>Merge</Button>
        <Button size="sm" variant="outline" onClick={onNo}>No</Button>
        <Button size="sm" variant="ghost" onClick={onNever}>Don't ask again</Button>
      </div>
    </div>
  );
}

function ConvertDialog({ dataset, column, onClose }: { dataset: Dataset; column: string | null; onClose: () => void }) {
  const applyColumnFix = useDatasetStore((s) => s.applyColumnFix);
  const preview = useMemo(() => (column ? previewNumberConversion(dataset, column) : null), [dataset, column]);
  return (
    <Dialog open={column !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="convert-dialog">
        <DialogHeader>
          <DialogTitle>Convert “{column}” to numbers</DialogTitle>
          <DialogDescription>
            "10,000+" becomes 10000 (its lower bound), "19M" 19,000,000, "512k" 512,000, "1.5G" 1,500,000,000. The original
            text is kept, so this can be undone.
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="font-normal">Before</th>
                  <th className="font-normal text-right">After</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {preview.samples.map((s) => (
                  <tr key={s.before}>
                    <td className="truncate max-w-48">{s.before}</td>
                    <td className="text-right">{s.after === null ? <span className="italic text-muted-foreground">missing</span> : s.after.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm" data-testid="convert-unconvertible">
              {preview.unconvertible.toLocaleString()} of {preview.total.toLocaleString()} values can't be read and will become missing.
            </p>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!column) return;
              applyColumnFix({ id: `numberSuffix:${column}`, column, kind: "numberSuffix", auto: false, lowerBound: preview?.lowerBound });
              onClose();
            }}
            data-testid="convert-confirm"
          >
            Convert
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Data-quality notices for the active dataset (Data view): duplicate rows, -1-style codes,
 * label variants, "Convert to number…" offers, and columns left as text with a warning.
 * Nothing here changes data until the user clicks.
 */
export function DataQualityPanel({ dataset }: { dataset: Dataset }) {
  const applyColumnFix = useDatasetStore((s) => s.applyColumnFix);
  const removeDuplicates = useDatasetStore((s) => s.removeDuplicates);
  const restoreDuplicates = useDatasetStore((s) => s.restoreDuplicates);
  const dismissSuggestion = useDatasetStore((s) => s.dismissSuggestion);
  const ensureColumnQuality = useDatasetStore((s) => s.ensureColumnQuality);
  const [, rerender] = useState(0);
  const [converting, setConverting] = useState<string | null>(null);

  useEffect(() => ensureColumnQuality(dataset.id), [dataset.id, ensureColumnQuality]);

  const meta = dataset.metadata;
  if (!meta) return null;
  const dismissed = new Set(meta.quality?.dismissed ?? []);
  const hidden = (key: string) => dismissed.has(key) || answeredNo.has(key);
  const no = (key: string) => { answeredNo.add(key); rerender((n) => n + 1); };
  const fixes = meta.columnFixes ?? [];
  const hasFix = (column: string, pred: (f: ColumnFix) => boolean) => fixes.some((f) => f.column === column && pred(f));

  const sentinels = meta.columns.flatMap((c) => {
    const s = c.quality?.sentinel;
    if (!s || !dataset.columns.includes(c.name)) return [];
    const key = suggestionKey("sentinel", c.name, String(s.value));
    if (hidden(key) || hasFix(c.name, (f) => f.kind === "sentinel" && f.sentinel === s.value)) return [];
    return [{ column: c.name, ...s, key }];
  });

  const variants = meta.columns.flatMap((c) =>
    (c.quality?.labelVariants ?? []).flatMap((group) => {
      const key = suggestionKey("variants", c.name, labelKey(group[0].value));
      const merged = hasFix(c.name, (f) => f.kind === "mergeLabels" && group.filter((g) => g.value !== f.merge!.to).every((g) => f.merge!.from.includes(g.value)));
      return hidden(key) || merged ? [] : [{ column: c.name, group, key }];
    })
  );

  const converts = meta.columns.flatMap((c) => {
    const key = suggestionKey("suffix", c.name);
    if (!c.quality?.suffixCandidate || hidden(key) || hasFix(c.name, (f) => f.kind === "numberSuffix")) return [];
    return [{ column: c.name, key, ...c.quality.suffixCandidate }];
  });

  const duplicates = meta.quality?.duplicateRowCount ?? 0;
  const removed = meta.removedDuplicateCount ?? 0;
  const currencyWarnings = Object.entries(meta.quality?.currencyWarnings ?? {});
  const groupingWarnings = Object.entries(meta.quality?.groupingWarnings ?? {});

  if (!duplicates && !sentinels.length && !variants.length && !converts.length && !currencyWarnings.length && !groupingWarnings.length) {
    return null;
  }

  return (
    <div role="region" aria-label="Data quality" className="space-y-3 p-4 rounded-lg border border-border text-sm" data-testid="data-quality-panel">
      <p className="font-semibold">Data quality</p>

      {duplicates > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center" data-testid="duplicates-notice">
          <p className="flex-1">
            {removed > 0
              ? `${removed.toLocaleString()} duplicate ${removed === 1 ? "row" : "rows"} removed (first occurrences kept).`
              : `${duplicates.toLocaleString()} duplicate ${duplicates === 1 ? "row" : "rows"} (every column equal to an earlier row).`}
          </p>
          {removed > 0 ? (
            <Button size="sm" variant="outline" onClick={restoreDuplicates} data-testid="restore-duplicates">Undo</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={removeDuplicates} data-testid="remove-duplicates">Remove duplicates</Button>
          )}
        </div>
      )}

      {sentinels.map((s) => (
        <div key={s.key} className="flex flex-col gap-2 sm:flex-row sm:items-center" data-testid={`sentinel-prompt-${s.column}`}>
          <p className="flex-1">
            {s.value} appears {s.count.toLocaleString()} times in {s.column}. Treat {s.value} as missing?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => applyColumnFix({ id: `sentinel:${s.column}:${s.value}`, column: s.column, kind: "sentinel", auto: false, sentinel: s.value })}
              data-testid={`sentinel-yes-${s.column}`}
            >
              Yes
            </Button>
            <Button size="sm" variant="outline" onClick={() => no(s.key)}>No</Button>
            <Button size="sm" variant="ghost" onClick={() => dismissSuggestion(dataset.id, s.key)}>Don't ask again for this column</Button>
          </div>
        </div>
      ))}

      {variants.map((v) => (
        <VariantSuggestion
          key={v.key}
          column={v.column}
          group={v.group}
          onMerge={(to) =>
            applyColumnFix({
              id: `merge:${v.column}:${labelKey(to)}:${Date.now()}`,
              column: v.column,
              kind: "mergeLabels",
              auto: false,
              merge: { from: v.group.filter((g) => g.value !== to).map((g) => g.value), to },
            })
          }
          onNo={() => no(v.key)}
          onNever={() => dismissSuggestion(dataset.id, v.key)}
        />
      ))}

      {converts.map((c) => (
        <div key={c.key} className="flex flex-col gap-2 sm:flex-row sm:items-center" data-testid={`convert-offer-${c.column}`}>
          <p className="flex-1">
            {c.column} is text like "10,000+" or "19M": {c.convertible.toLocaleString()} of {c.total.toLocaleString()} values can be read as numbers.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setConverting(c.column)} data-testid={`convert-open-${c.column}`}>Convert to number…</Button>
            <Button size="sm" variant="ghost" onClick={() => dismissSuggestion(dataset.id, c.key)}>Don't ask again</Button>
          </div>
        </div>
      ))}

      {currencyWarnings.map(([column, codes]) => (
        <p key={column} data-testid={`currency-warning-${column}`}>
          <Badge variant="outline" className="mr-2 border-tertiary text-tertiary">left as text</Badge>
          {column} mixes currencies ({codes.join(", ")}), so it wasn't converted to numbers.
        </p>
      ))}
      {groupingWarnings.map(([column, why]) => (
        <p key={column} data-testid={`grouping-warning-${column}`}>
          <Badge variant="outline" className="mr-2 border-tertiary text-tertiary">left as text</Badge>
          {column} {why.startsWith("mixes") ? why : `has ${why}`}, so its commas weren't removed.
        </p>
      ))}

      <ConvertDialog dataset={dataset} column={converting} onClose={() => setConverting(null)} />
    </div>
  );
}
