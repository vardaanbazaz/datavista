import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle, ShieldCheck } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { useImportStore } from "@/store/importStore";
import { MAX_IMPORT_BYTES } from "@/features/upload/lib/importLimits";
import { Ornament } from "@/shared/components/ornament";

export function FileUpload() {
  const importForUpload = useImportStore((state) => state.importForUpload);
  const isImporting = useImportStore((state) => state.phase !== "idle");
  const [dragActive, setDragActive] = useState(false);
  const openPrivacy = useUiStore((state) => state.setIsPrivacyOpen);

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
    <Card data-tour="sidebar-upload">
      <Ornament.Corners />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-ornament" aria-hidden />
          Upload Dataset
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${
            dragActive 
              ? "border-primary bg-primary/5 scale-105 animate-pulse-glow" 
              : "border-borderStrong hover:border-primary hover:bg-muted/40"
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
              <div className="w-16 h-16 mx-auto rounded-full border border-ornament/60 ring-1 ring-ornament/30 ring-offset-4 ring-offset-card flex items-center justify-center">
                <FileText className="w-7 h-7 text-ornament" aria-hidden />
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
                    <Button asChild>
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
            <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Automatic Data Detection</p>
              <p className="text-muted-foreground">
                Column types (numeric, categorical, date) are detected automatically
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="w-5 h-5 text-tertiary flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Data Requirements</p>
              <p className="text-muted-foreground">
                First row should contain column headers. Missing values will be handled automatically.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 text-sm" data-testid="upload-privacy-notice">
            <ShieldCheck className="w-5 h-5 text-primary-ink flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Your data stays in this browser</p>
              <p className="text-muted-foreground">
                Files are read and stored here, not uploaded, and kept until you delete them: one dataset from its
                menu in the sidebar, or everything with{" "}
                <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => openPrivacy(true)}>
                  Data &amp; privacy → Clear all local data
                </button>
                . AI features, if you add your own key, send some of it to the AI provider.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}