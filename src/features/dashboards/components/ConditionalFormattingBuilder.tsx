import { useState, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Plus, Trash2, Palette, Sparkles, CheckCircle2, AlertTriangle, Code } from "lucide-react";
import { ConditionalFormatRule, FormattingStyle } from "@/shared/types";
import { compile } from "@/shared/services/formulaEngine";
import { Hint } from "@/shared/components/Hint";

interface ConditionalFormattingBuilderProps {
  rules: ConditionalFormatRule[];
  onChange: (rules: ConditionalFormatRule[]) => void;
  availableColumns: string[];
  title?: string;
}

const PRESET_SWATCHES: Array<{ label: string; style: FormattingStyle; badgeClass: string }> = [
  {
    label: "Danger Red",
    style: { textColor: "#A8261E", backgroundColor: "#F6E3E0", fill: "#A8261E" },
    badgeClass: "bg-destructive/10 text-foreground border-destructive/50 hover:bg-destructive/20"
  },
  {
    label: "Success Green",
    style: { textColor: "#2E6B3A", backgroundColor: "#E4EFE2", fill: "#2E6B3A" },
    badgeClass: "bg-success/10 text-foreground border-success/50 hover:bg-success/20"
  },
  {
    label: "Warning Yellow",
    style: { textColor: "#8D6300", backgroundColor: "#F5EBD3", fill: "#8D6300" },
    badgeClass: "bg-tertiary/10 text-foreground border-tertiary/50 hover:bg-tertiary/20"
  },
  {
    label: "Info Blue",
    style: { textColor: "#2F5F9E", backgroundColor: "#E6EEF8", fill: "#2F5F9E" },
    badgeClass: "bg-primary/10 text-foreground border-primary/50 hover:bg-primary/20"
  },
  {
    label: "Purple Accent",
    style: { textColor: "#93398E", backgroundColor: "#F3E5F2", fill: "#93398E" },
    badgeClass: "bg-primary/10 text-foreground border-primary/50 hover:bg-primary/20"
  }
];

export function ConditionalFormattingBuilder({
  rules,
  onChange,
  availableColumns,
  title = "Conditional Formatting Rules"
}: ConditionalFormattingBuilderProps) {
  const [activeRuleId, setActiveRuleId] = useState<string | null>(
    rules.length > 0 ? rules[0].id : null
  );

  const handleAddRule = () => {
    const newRule: ConditionalFormatRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      targetColumn: "",
      conditionExpression: availableColumns.length > 0 ? `${availableColumns[0]} < 0` : "value < 0",
      styles: {
        textColor: "#A8261E",
        backgroundColor: "#F6E3E0",
        fill: "#A8261E"
      }
    };
    onChange([...rules, newRule]);
    setActiveRuleId(newRule.id);
  };

  const handleRemoveRule = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    onChange(updated);
    if (activeRuleId === id) {
      setActiveRuleId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleUpdateRule = (id: string, updates: Partial<ConditionalFormatRule>) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, ...updates } : r));
    onChange(updated);
  };

  const handleUpdateStyle = (id: string, styleUpdates: Partial<FormattingStyle>) => {
    const updated = rules.map((r) => {
      if (r.id === id) {
        return {
          ...r,
          styles: { ...r.styles, ...styleUpdates }
        };
      }
      return r;
    });
    onChange(updated);
  };

  const activeRule = rules.find((r) => r.id === activeRuleId) || rules[0] || null;

  // Validation state for active rule
  const activeRuleValidation = useMemo(() => {
    if (!activeRule || !activeRule.conditionExpression.trim()) {
      return { valid: false, message: "Enter a condition expression" };
    }
    try {
      compile(activeRule.conditionExpression.trim());
      return { valid: true, message: "Valid expression syntax" };
    } catch (err: unknown) {
      return { valid: false, message: (err as Error)?.message || "Syntax error" };
    }
  }, [activeRule]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary-ink" />
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <Button onClick={handleAddRule} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg bg-muted/20">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground font-medium">
            No formatting rules defined yet.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Click "Add Rule" above to highlight threshold values automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Rules List Column */}
          <div className="space-y-2 border-r pr-4">
            <Label className="text-sm font-semibold text-foreground">
              Rules ({rules.length})
            </Label>
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {rules.map((rule, idx) => {
                const isActive = rule.id === activeRuleId;
                return (
                  <div
                    key={rule.id}
                    className={`p-3 rounded-lg border text-sm transition-all flex items-center justify-between gap-2 ${
                      isActive
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "hover:bg-accent/50 border-border"
                    }`}
                  >
                    {/* Selecting a rule is a real button (keyboard, screen readers); delete stays separate. */}
                    <button
                      type="button"
                      onClick={() => setActiveRuleId(rule.id)}
                      aria-pressed={isActive}
                      className="min-w-0 flex-1 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-muted-foreground">
                          #{idx + 1}
                        </span>
                        {rule.targetColumn ? (
                          <Badge variant="outline" className="text-xs px-1 py-0 truncate">
                            {rule.targetColumn}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs px-1 py-0">
                            All Columns
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs font-mono truncate mt-1 text-foreground/90">
                        {rule.conditionExpression || "No condition"}
                      </div>
                    </button>

                    {/* Swatch Preview */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        className="w-5 h-5 rounded border shadow-sm flex items-center justify-center text-xs font-bold"
                        style={{
                          color: rule.styles.textColor || "#000000",
                          backgroundColor: rule.styles.backgroundColor || "#ffffff"
                        }}
                      >
                        Aa
                      </div>
                      <Hint label="Delete this formatting rule">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveRule(rule.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </Hint>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Rule Editor */}
          {activeRule ? (
            <div className="md:col-span-2 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="target-column">Target Column / Metric</Label>
                <Select
                  value={activeRule.targetColumn || "all"}
                  onValueChange={(val) =>
                    handleUpdateRule(activeRule.id, {
                      targetColumn: val === "all" ? "" : val
                    })
                  }
                >
                  <SelectTrigger id="target-column">
                    <SelectValue placeholder="All Columns / Visual Element" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Columns / Visual Element</SelectItem>
                    {availableColumns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="condition-expr">Condition Expression</Label>
                  <span className="text-xs text-muted-foreground">
                    e.g. <code className="bg-muted px-1 rounded">Revenue &lt; 0</code> or{" "}
                    <code className="bg-muted px-1 rounded">[Profit] &lt; [Target]</code>
                  </span>
                </div>
                <Input
                  id="condition-expr"
                  value={activeRule.conditionExpression}
                  onChange={(e) =>
                    handleUpdateRule(activeRule.id, {
                      conditionExpression: e.target.value
                    })
                  }
                  placeholder="e.g. Revenue < 0 or Status == 'Critical'"
                  className="font-mono text-sm"
                />

                {/* Validation Status */}
                <div className="flex items-center gap-1.5 text-xs mt-1">
                  {activeRuleValidation.valid ? (
                    <span className="text-success flex items-center gap-1 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {activeRuleValidation.message}
                    </span>
                  ) : (
                    <span className="text-tertiary flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {activeRuleValidation.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Formula Helper Insertion */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Code className="h-3 w-3" /> Quick Insert Fields & Operators
                </Label>
                <div className="flex flex-wrap gap-1">
                  {availableColumns.slice(0, 5).map((col) => (
                    <Button
                      key={col}
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() =>
                        handleUpdateRule(activeRule.id, {
                          conditionExpression: `${activeRule.conditionExpression} ${col}`.trim()
                        })
                      }
                    >
                      {col}
                    </Button>
                  ))}
                  {["< 0", "> 1000", "== 0", "AND", "OR"].map((op) => (
                    <Button
                      key={op}
                      variant="secondary"
                      size="sm"
                      className="h-6 text-xs px-2 font-mono"
                      onClick={() =>
                        handleUpdateRule(activeRule.id, {
                          conditionExpression: `${activeRule.conditionExpression} ${op}`.trim()
                        })
                      }
                    >
                      {op}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Styles Section */}
              <div className="space-y-3 border-t pt-4">
                <Label className="text-sm font-semibold text-foreground">
                  Formatting Style
                </Label>

                {/* Presets */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Preset Color Swatches</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_SWATCHES.map((swatch) => (
                      <Badge
                        key={swatch.label}
                        className={`cursor-pointer transition-transform hover:scale-105 border ${swatch.badgeClass}`}
                        onClick={() =>
                          handleUpdateStyle(activeRule.id, swatch.style)
                        }
                      >
                        {swatch.label}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Custom Color Inputs */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="text-color" className="text-xs">
                      Text / Fill Color
                    </Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="text-color"
                        value={activeRule.styles.textColor || "#A8261E"}
                        onChange={(e) =>
                          handleUpdateStyle(activeRule.id, {
                            textColor: e.target.value,
                            fill: e.target.value
                          })
                        }
                        className="w-8 h-8 rounded cursor-pointer border p-0.5"
                      />
                      <Input
                        value={activeRule.styles.textColor || "#A8261E"}
                        onChange={(e) =>
                          handleUpdateStyle(activeRule.id, {
                            textColor: e.target.value,
                            fill: e.target.value
                          })
                        }
                        className="font-mono text-xs h-8"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="bg-color" className="text-xs">
                      Background Color
                    </Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="bg-color"
                        value={activeRule.styles.backgroundColor || "#F6E3E0"}
                        onChange={(e) =>
                          handleUpdateStyle(activeRule.id, {
                            backgroundColor: e.target.value
                          })
                        }
                        className="w-8 h-8 rounded cursor-pointer border p-0.5"
                      />
                      <Input
                        value={activeRule.styles.backgroundColor || "#F6E3E0"}
                        onChange={(e) =>
                          handleUpdateStyle(activeRule.id, {
                            backgroundColor: e.target.value
                          })
                        }
                        className="font-mono text-xs h-8"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
