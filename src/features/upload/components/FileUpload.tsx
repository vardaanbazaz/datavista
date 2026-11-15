import { useState, useCallback } from "react";
import { DataPanel } from "@/shared/components/surface";
import { Button } from "@/shared/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle, ShieldCheck } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { useImportStore } from "@/store/importStore";
import { MAX_IMPORT_BYTES } from "@/features/upload/lib/importLimits";

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
    <DataPanel surface="glass" title="Upload a file" data-testid="upload-panel">
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragActive ? "border-primary-ink bg-primary/10" : "border-borderStrong bg-background/30 hover:border-primary-ink hover:bg-accent/60"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          data-testid="file-drop-zone"
        >
          {isImporting ? (
            <div className="space-y-4">
              <div className="w-12 h-12 mx-auto bg-primary rounded-xl flex items-center justify-center">
                <Upload className="w-6 h-6 text-primary-foreground animate-pulse" aria-hidden />
              </div>
              <p className="font-medium">Importing your data...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary-ink" aria-hidden />
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
    </DataPanel>
  );
}