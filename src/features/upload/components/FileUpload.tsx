import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Progress } from "@/shared/components/ui/progress";
import { useToast } from "@/shared/hooks/use-toast";
import { Upload, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { parseCsvFile } from "@/shared/services/csvParse";
import * as XLSX from "xlsx";
import { readWorkbookWithCalendarDates } from "@/features/upload/lib/xlsxDates";
import { useDatasetStore } from "@/store/datasetStore";
import { processRawData } from "@/shared/services/parsingService";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";

export function FileUpload() {
  const onDatasetUpload = useDatasetStore((state) => state.uploadDataset);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const { toast } = useToast();

  const handleFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const fileName = file.name;
      const fileExtension = fileName.split('.').pop()?.toLowerCase();
      
      // File Size Validations (Soft warning > 50MB, Hard limit > 100MB)
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > 100) {
        toast({
          title: "File rejected",
          description: `File size is ${fileSizeMB.toFixed(1)}MB. The maximum supported size is 100MB to prevent browser instability.`,
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }
      
      if (fileSizeMB > 50) {
        toast({
          title: "⚠️ Large file warning",
          description: `The file size is ${fileSizeMB.toFixed(1)}MB. Processing this file might temporarily freeze or slow down the interface.`,
        });
      }

      let rawData: Record<string, unknown>[] = [];

      if (fileExtension === 'csv' || fileExtension === 'tsv') {
        // Parse CSV/TSV with Papa Parse (shared path: pandas-style header names)
        parseCsvFile(file, fileExtension === 'tsv' ? '\t' : undefined).then(
          (results) => {
            try {
              if (results.errors.length > 0) {
                console.warn('CSV parsing warnings:', results.errors);
              }
              
              rawData = results.rows;
              setUploadProgress(70);
              
              const dataset = processRawData(rawData, fileName);
              setUploadProgress(100);
              
              setTimeout(() => {
                onDatasetUpload(dataset);
                setIsUploading(false);
                setUploadProgress(0);
              }, 500);
            } catch (error: unknown) {
              toast({
                title: "Processing failed",
                description: (error as Error)?.message || "An error occurred while cleaning dataset.",
                variant: "destructive",
              });
              setIsUploading(false);
              setUploadProgress(0);
            }
          },
          (error: Error) => {
            toast({
              title: "Parse error",
              description: `CSV parsing error: ${error.message}`,
              variant: "destructive",
            });
            setIsUploading(false);
            setUploadProgress(0);
          }
        );
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Parse Excel files
        const arrayBuffer = await file.arrayBuffer();
        setUploadProgress(25);
        
        // Date cells become calendar strings, not serial numbers (lib/xlsxDates.ts).
        const workbook = readWorkbookWithCalendarDates(arrayBuffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        setUploadProgress(50);
        
        rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }); // Prevent missing properties
        setUploadProgress(75);
        
        try {
          const dataset = processRawData(rawData, fileName);
          setUploadProgress(100);
          
          setTimeout(() => {
            onDatasetUpload(dataset);
            setIsUploading(false);
            setUploadProgress(0);
          }, 500);
        } catch (error: unknown) {
          toast({
            title: "Processing failed",
            description: (error as Error)?.message || "An error occurred while cleaning dataset.",
            variant: "destructive",
          });
          setIsUploading(false);
          setUploadProgress(0);
        }
      } else {
        throw new Error("Unsupported file format. Please upload CSV, TSV, or XLSX files.");
      }
    } catch (error: unknown) {
      console.error('File processing error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "An error occurred while processing the file",
        variant: "destructive",
      });
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [onDatasetUpload, toast]);

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
        >
          {isUploading ? (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto gradient-primary rounded-full flex items-center justify-center">
                <Upload className="w-8 h-8 text-primary-foreground animate-pulse" />
              </div>
              <div>
                <p className="font-medium">Processing your data...</p>
                <Progress value={uploadProgress} className="mt-2" />
                <p className="text-sm text-muted-foreground mt-1">
                  {uploadProgress}% complete
                </p>
              </div>
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
                  Supports CSV, TSV, and XLSX files up to 100MB
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