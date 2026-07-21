import { useState, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Plus, Trash2, Palette, Sparkles, CheckCircle2, AlertTriangle, Code } from "lucide-react";
import { ConditionalFormatRule, FormattingStyle } from "@/shared/types";
import { compile } from "@/shared/services/formulaEngine";
import { allFunctions } from "@/shared/services/formula/library";

interface ConditionalFormattingBuilderProps {
  rules: ConditionalFormatRule[];
  onChange: (rules: ConditionalFormatRule[]) => void;
  availableColumns: string[];
  title?: string;
}

const PRESET_SWATCHES: Array<{ label: string; style: FormattingStyle; badgeClass: string }> = [
  {
    label: "Danger Red",
    style: { textColor: "#ef4444", backgroundColor: "#fef2f2", fill: "#ef4444" },
    badgeClass: "bg-red-100 text-red-700 border-red-200 hover:bg-red-200"
  },
  {
    label: "Success Green",
    style: { textColor: "#10b981", backgroundColor: "#ecfdf5", fill: "#10b981" },
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200"
  },
  {
    label: "Warning Yellow",
    style: { textColor: "#f59e0b", backgroundColor: "#fffbeb", fill: "#f59e0b" },
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200"
  },
  {
    label: "Info Blue",
    style: { textColor: "#3b82f6", backgroundColor: "#eff6ff", fill: "#3b82f6" },
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200"
  },
  {
    label: "Purple Accent",
    style: { textColor: "#8b5cf6", backgroundColor: "#f3e8ff", fill: "#8b5cf6" },
    badgeClass: "bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200"
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
        textColor: "#ef4444",
        backgroundColor: "#fef2f2",
        fill: "#ef4444"
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
          <Palette className="h-5 w-5 text-primary" />
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
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Rules ({rules.length})
            </Label>
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {rules.map((rule, idx) => {
                const isActive = rule.id === activeRuleId;
                return (
                  <div
                    key={rule.id}
                    onClick={() => setActiveRuleId(rule.id)}
                    className={`p-3 rounded-lg border text-sm cursor-pointer transition-all flex items-center justify-between gap-2 ${
                      isActive
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "hover:bg-accent/50 border-border"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-muted-foreground">
                          #{idx + 1}
                        </span>
                        {rule.targetColumn ? (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 truncate">
                            {rule.targetColumn}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            All Columns
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs font-mono truncate mt-1 text-foreground/90">
                        {rule.conditionExpression || "No condition"}
                      </div>
                    </div>
                    
                    {/* Swatch Preview */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        className="w-5 h-5 rounded border shadow-sm flex items-center justify-center text-[10px] font-bold"
                        style={{
                          color: rule.styles.textColor || "#000000",
                          backgroundColor: rule.styles.backgroundColor || "#ffffff"
                        }}
                      >
                        Aa
                      </div>
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
                  <span className="text-[11px] text-muted-foreground">
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
                    <span className="text-emerald-500 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {activeRuleValidation.message}
                    </span>
                  ) : (
                    <span className="text-amber-500 flex items-center gap-1">
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
                      className="h-6 text-[11px] px-2"
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
                      className="h-6 text-[11px] px-2 font-mono"
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
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
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
                        value={activeRule.styles.textColor || "#ef4444"}
                        onChange={(e) =>
                          handleUpdateStyle(activeRule.id, {
                            textColor: e.target.value,
                            fill: e.target.value
                          })
                        }
                        className="w-8 h-8 rounded cursor-pointer border p-0.5"
                      />
                      <Input
                        value={activeRule.styles.textColor || "#ef4444"}
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
                        value={activeRule.styles.backgroundColor || "#fef2f2"}
                        onChange={(e) =>
                          handleUpdateStyle(activeRule.id, {
                            backgroundColor: e.target.value
                          })
                        }
                        className="w-8 h-8 rounded cursor-pointer border p-0.5"
                      />
                      <Input
                        value={activeRule.styles.backgroundColor || "#fef2f2"}
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
