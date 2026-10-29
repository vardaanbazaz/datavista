import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { useImportStore } from "@/store/importStore";
import { MAX_IMPORT_BYTES } from "@/features/upload/lib/importLimits";

export function FileUpload() {
  const importForUpload = useImportStore((state) => state.importForUpload);
  const isImporting = useImportStore((state) => state.phase !== "idle");
  const [dragActive, setDragActive] = useState(false);

  // Size cap, format check, parsing and progress all live in the shared pipeline
  // (store/importStore.ts -> lib/importClient.ts -> worker/import.worker.ts).
  const handleFile = useCallback((file: File) => {
    void importForUpload(file);
  }, [importForUpload]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
    // Let the same file be chosen again (e.g. after cancelling).
    e.target.value = "";
  }, [handleFile]);

  return (
    <Card className="glass shadow-elegant" data-tour="sidebar-upload">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload Dataset
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${
            dragActive 
              ? "border-primary bg-primary/5 scale-105 animate-pulse-glow" 
              : "border-border hover:border-primary/50 hover:bg-muted/20"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          data-testid="file-drop-zone"
        >
          {isImporting ? (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto gradient-primary rounded-full flex items-center justify-center">
                <Upload className="w-8 h-8 text-primary-foreground animate-pulse" />
              </div>
              <p className="font-medium">Importing your data...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                <FileText className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="text-lg font-medium mb-2">
                  Drop your data file here, or click to browse
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Supports CSV, TSV, and XLSX files up to {MAX_IMPORT_BYTES / 1_000_000} MB
                </p>
                <input
                  type="file"
                  id="file-upload"
                  data-testid="file-upload-input"
                  className="hidden"
                  accept=".csv,.tsv,.xlsx,.xls"
                  onChange={handleFileSelect}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="premium">
                      <label htmlFor="file-upload" className="cursor-pointer">
                        Select File
                      </label>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Browse local files (CSV, TSV, or XLSX)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-start gap-3 text-sm">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Automatic Data Detection</p>
              <p className="text-muted-foreground">
                Column types (numeric, categorical, date) are detected automatically
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Data Requirements</p>
              <p className="text-muted-foreground">
                First row should contain column headers. Missing values will be handled automatically.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}