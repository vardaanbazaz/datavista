import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Settings, Plus, Trash2, HelpCircle, AlertTriangle, Code } from "lucide-react";
import { useDatasetStore } from "@/store/datasetStore";
import { formulaEngine } from "@/shared/services/formulaEngine";
import { allFunctions } from "@/shared/services/formula/library";

interface CalculatedFieldsManagerProps {
  trigger?: React.ReactNode;
}

export function CalculatedFieldsManager({ trigger }: CalculatedFieldsManagerProps) {
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  const addCalculatedField = useDatasetStore((state) => state.addCalculatedField);
  const deleteCalculatedField = useDatasetStore((state) => state.deleteCalculatedField);

  const [isOpen, setIsOpen] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [expression, setExpression] = useState("");

  const existingColumns = useMemo(() => {
    if (!activeDataset) return [];
    // We only want raw/imported columns to validate against duplicate names
    const calculatedFieldNames = (activeDataset.calculatedFields || []).map(f => f.name);
    return activeDataset.columns.filter(c => !calculatedFieldNames.includes(c));
  }, [activeDataset]);

  const calculatedFields = useMemo(() => {
    return activeDataset?.calculatedFields || [];
  }, [activeDataset]);

  // Real-time validation errors
  const validationErrors = useMemo(() => {
    if (!activeDataset || !fieldName.trim() || !expression.trim()) return [];
    return formulaEngine.validate(
      fieldName.trim(),
      expression.trim(),
      existingColumns,
      calculatedFields
    );
  }, [fieldName, expression, existingColumns, calculatedFields, activeDataset]);

  const isValid = fieldName.trim() && expression.trim() && validationErrors.length === 0;

  const handleAdd = () => {
    if (!isValid) return;
    addCalculatedField(fieldName.trim(), expression.trim());
    setFieldName("");
    setExpression("");
  };

  const functionsList = useMemo(() => {
    return allFunctions.map(f => {
      const sigArgs = f.args.map(a => a.name + (a.optional ? "?" : "")).join(", ");
      return {
        name: `${f.name}(${sigArgs})`,
        desc: f.description,
        insert: `${f.name}(`
      };
    });
  }, []);

  const handleInsert = (text: string) => {
    setExpression((prev) => prev + text);
  };

  if (!activeDataset) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            Calculated Fields
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-3xl glass border-white/20 shadow-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2 gradient-primary bg-clip-text text-transparent">
            <Code className="h-6 w-6 text-primary" />
            Calculated Fields & Formulas
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mt-4">
          {/* Editor Column */}
          <div className="md:col-span-3 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="field-name">Field Name</Label>
              <Input
                id="field-name"
                placeholder="e.g. Total Revenue"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                className="focus:shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expression">Formula Expression</Label>
              <textarea
                id="expression"
                placeholder="e.g. [Price] * [Quantity] * (1 - [Discount])"
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                className="w-full min-h-[100px] p-3 text-sm font-mono bg-secondary/30 rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring resize-y"
              />
            </div>

            {/* Validation Alerts */}
            {validationErrors.length > 0 && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Validation Error</AlertTitle>
                <AlertDescription className="text-xs space-y-1">
                  {validationErrors.map((err, idx) => (
                    <div key={idx}>• {err.message}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleAdd}
              disabled={!isValid}
              className="w-full gap-2 transition-all duration-200"
            >
              <Plus className="h-4 w-4" />
              Add Calculated Field
            </Button>

            {/* Existing Calculated Fields */}
            <div className="pt-4 border-t border-white/10">
              <h4 className="text-sm font-semibold mb-3">Calculated Fields in Dataset</h4>
              {calculatedFields.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No calculated fields created yet.</p>
              ) : (
                <ScrollArea className="h-[150px] pr-2">
                  <div className="space-y-2">
                    {calculatedFields.map((field) => (
                      <div 
                        key={field.name} 
                        className="flex items-center justify-between p-2 rounded bg-secondary/20 border border-white/5 text-xs"
                      >
                        <div className="space-y-1">
                          <span className="font-semibold text-primary">{field.name}</span>
                          <code className="block text-[10px] text-muted-foreground">{field.expression}</code>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteCalculatedField(field.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          {/* Reference Column */}
          <div className="md:col-span-2 space-y-4 bg-secondary/10 p-4 rounded-lg border border-white/5 flex flex-col h-[520px]">
            <div className="flex items-center gap-1.5 text-sm font-semibold border-b border-white/5 pb-2 text-primary">
              <HelpCircle className="h-4 w-4" />
              Formula Reference
            </div>

            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-4">
                {/* Columns */}
                <div>
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Columns (Double-click to insert)</h5>
                  <div className="flex flex-wrap gap-1">
                    {existingColumns.map(col => (
                      <Badge
                        key={col}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-[10px] py-0.5 px-1.5 transition-colors"
                        onDoubleClick={() => handleInsert(`[${col}]`)}
                      >
                        {col}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Built-in Functions */}
                <div>
                  <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Functions (Click to insert)</h5>
                  <div className="space-y-2">
                    {functionsList.map(func => (
                      <div 
                        key={func.name}
                        className="text-[11px] p-1.5 rounded hover:bg-secondary/40 cursor-pointer transition-colors border border-transparent hover:border-white/5"
                        onClick={() => handleInsert(func.insert)}
                      >
                        <div className="font-mono font-bold text-primary">{func.name}</div>
                        <div className="text-[10px] text-muted-foreground">{func.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export default CalculatedFieldsManager;
