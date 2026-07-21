import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { LayoutTemplate, CheckCircle2, AlertTriangle, Layers, Database } from "lucide-react";
import { useTemplateStore } from "../store/templateStore";
import { useDatasetStore } from "@/store/datasetStore";
import { useChartStore } from "@/store/chartStore";
import { useDashboardStore } from "../store/dashboardStore";
import { templateEngine } from "../services/templateEngine";

interface InstantiateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstantiateTemplateModal({ isOpen, onClose }: InstantiateTemplateModalProps) {
  const templates = useTemplateStore((state) => state.templates);
  const datasets = useDatasetStore((state) => state.datasets);
  const activeDataset = useDatasetStore((state) => state.activeDataset);
  
  const createChart = useChartStore((state) => state.createChart);
  const loadDashboard = useDashboardStore((state) => state.loadDashboard);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(activeDataset?.id || "");
  const [dashboardName, setDashboardName] = useState<string>("");

  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  const targetDataset = useMemo(() => {
    return datasets.find((d) => d.id === selectedDatasetId) || null;
  }, [datasets, selectedDatasetId]);

  const schemaValidation = useMemo(() => {
    if (!selectedTemplate || !targetDataset) return null;
    return templateEngine.validateSchema(selectedTemplate.requiredSchema, targetDataset);
  }, [selectedTemplate, targetDataset]);

  const handleInstantiate = () => {
    if (!selectedTemplate || !targetDataset || !schemaValidation?.valid) return;

    const { dashboard, charts } = templateEngine.instantiateTemplate(
      selectedTemplate,
      targetDataset,
      dashboardName.trim() || `${selectedTemplate.name} (${targetDataset.name})`
    );

    // Save charts to chartStore
    charts.forEach((chart) => createChart(chart));

    // Save dashboard to dashboardStore
    const currentDashboards = useDashboardStore.getState().dashboards;
    useDashboardStore.setState({ dashboards: [dashboard, ...currentDashboards] });

    // Load newly created dashboard
    loadDashboard(dashboard.id);

    // Reset & close
    setSelectedTemplateId("");
    setDashboardName("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl glass border-white/20 shadow-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            Create Dashboard from Template
          </DialogTitle>
          <DialogDescription>
            Instantiate an identical layout, widget set, and formatting rules on a new dataset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Select Template */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              1. Select Dashboard Template
            </Label>
            <Select value={selectedTemplateId} onValueChange={(val) => {
              setSelectedTemplateId(val);
              const tpl = templates.find(t => t.id === val);
              if (tpl && targetDataset) {
                setDashboardName(`${tpl.name} (${targetDataset.name})`);
              }
            }}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.length === 0 ? (
                  <SelectItem value="none" disabled>No saved templates available</SelectItem>
                ) : (
                  templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{tpl.name}</span>
                        {tpl.description && (
                          <span className="text-[10px] text-muted-foreground">{tpl.description}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Select Target Dataset */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              2. Select Target Dataset
            </Label>
            <Select value={selectedDatasetId} onValueChange={(val) => {
              setSelectedDatasetId(val);
              const ds = datasets.find(d => d.id === val);
              if (selectedTemplate && ds) {
                setDashboardName(`${selectedTemplate.name} (${ds.name})`);
              }
            }}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Choose target dataset..." />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((ds) => (
                  <SelectItem key={ds.id} value={ds.id}>
                    {ds.name} ({ds.columns.length} columns)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schema Validation Status */}
          {selectedTemplate && targetDataset && schemaValidation && (
            <div className={`p-3 rounded-lg border text-xs space-y-2 ${
              schemaValidation.valid
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
            }`}>
              <div className="flex items-center gap-2 font-medium">
                {schemaValidation.valid ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Schema Compatible! All required columns are present in "{targetDataset.name}".</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>Schema Incompatible! Target dataset is missing required columns:</span>
                  </>
                )}
              </div>

              {!schemaValidation.valid && (
                <div className="flex flex-wrap gap-1 pl-6">
                  {schemaValidation.missingColumns.map((col) => (
                    <Badge key={col} variant="destructive" className="text-[10px]">
                      {col}
                    </Badge>
                  ))}
                </div>
              )}

              {schemaValidation.valid && (
                <div className="flex flex-wrap gap-1 pl-6">
                  {selectedTemplate.requiredSchema.map((req) => (
                    <Badge key={req.name} variant="outline" className="text-[10px] border-emerald-500/40">
                      {req.name} ({req.dataType})
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dashboard Name Input */}
          <div className="space-y-2">
            <Label htmlFor="dash-inst-name">New Dashboard Name</Label>
            <Input
              id="dash-inst-name"
              placeholder="Dashboard Name..."
              value={dashboardName}
              onChange={(e) => setDashboardName(e.target.value)}
              className="bg-background/50"
            />
          </div>
        </div>

        <DialogFooter className="mt-6 flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="premium"
            disabled={!selectedTemplate || !targetDataset || !schemaValidation?.valid}
            onClick={handleInstantiate}
          >
            Instantiate Dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
