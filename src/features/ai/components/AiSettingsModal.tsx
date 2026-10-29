import { useState, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Hint } from "@/shared/components/Hint";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { Sparkles, Key, Eye, EyeOff, Check, Cpu, HelpCircle, CloudOff, ShieldCheck } from "lucide-react";
import { useUiStore, LlmProvider } from "@/store/uiStore";
import { toast } from "@/shared/hooks/use-toast";
import { providerDisplayName } from "@/features/ai/providerDisplayName";

interface AiSettingsModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  trigger?: React.ReactNode;
}

export function AiSettingsModal({ isOpen: externalIsOpen, onClose: externalOnClose, trigger }: AiSettingsModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = (open: boolean) => {
    if (externalOnClose && !open) {
      externalOnClose();
    }
    setInternalIsOpen(open);
  };

  const { llmApiKey, llmProvider, setLlmApiKey, setLlmProvider, resetTour } = useUiStore(
    useShallow((state) => ({
      llmApiKey: state.llmApiKey,
      llmProvider: state.llmProvider,
      setLlmApiKey: state.setLlmApiKey,
      setLlmProvider: state.setLlmProvider,
      resetTour: state.resetTour,
    }))
  );

  const setIsPrivacyOpen = useUiStore((state) => state.setIsPrivacyOpen);
  const [apiKeyInput, setApiKeyInput] = useState(llmApiKey);
  const [providerInput, setProviderInput] = useState<LlmProvider>(llmProvider);
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKeyInput(llmApiKey);
      setProviderInput(llmProvider);
      setIsSaved(false);
    }
  }, [isOpen, llmApiKey, llmProvider]);

  const handleSave = () => {
    setLlmApiKey(apiKeyInput.trim());
    setLlmProvider(providerInput);
    setIsSaved(true);

    toast({
      title: "AI Settings Saved",
      description: `Provider set to ${providerInput.toUpperCase()} with key ending in ...${apiKeyInput.slice(-4) || "none"}`,
    });

    setTimeout(() => {
      setIsOpen(false);
    }, 400);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 shadow-2xl p-6 text-zinc-900 dark:text-zinc-100">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold flex items-center gap-2 bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
            <Sparkles className="h-5 w-5 text-zinc-700 dark:text-zinc-300 animate-pulse" />
            AI Co-Pilot Settings
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure your AI provider and API key to enable natural language queries and formula generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* AI Active / Offline Status Banner — reflects the currently SAVED provider/key,
              not the unsaved draft inputs below, so it never claims AI is active mid-edit. */}
          {llmApiKey ? (
            <div className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                AI Active — {providerDisplayName(llmProvider)}
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60 px-3 py-2 flex items-center gap-2">
              <CloudOff className="h-4 w-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Offline Mode — heuristic-based insights only
              </p>
            </div>
          )}

          {/* Provider Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-primary" /> LLM Provider
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={providerInput === "gemini" ? "premium" : "outline"}
                    className="justify-center gap-2 h-10 text-xs"
                    onClick={() => setProviderInput("gemini")}
                  >
                    Google Gemini
                    {providerInput === "gemini" && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                        {apiKeyInput.trim() ? "Active" : "Selected"}
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Use Google Gemini model API</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={providerInput === "openai" ? "premium" : "outline"}
                    className="justify-center gap-2 h-10 text-xs"
                    onClick={() => setProviderInput("openai")}
                  >
                    OpenAI GPT-4o
                    {providerInput === "openai" && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0">
                        {apiKeyInput.trim() ? "Active" : "Selected"}
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Use OpenAI GPT-4o model API</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-2">
            <Label htmlFor="api-key" className="text-xs font-semibold flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-primary" /> API Key
            </Label>
            <div className="relative flex items-center">
              <Input
                id="api-key"
                type={showKey ? "text" : "password"}
                placeholder={providerInput === "gemini" ? "AIzaSy..." : "sk-..."}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="pr-10 text-xs font-mono"
              />
              <Hint label={showKey ? "Hide API key" : "Show API key"}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </Hint>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {apiKeyInput ? (
                <span className="text-emerald-500 font-medium flex items-center gap-1">
                  <Check className="h-3 w-3" /> Saved in this browser&apos;s localStorage (not encrypted). Empty the field and save to remove it.
                </span>
              ) : (
                "Leave blank to use the built-in offline smart heuristic engine."
              )}
            </p>
          </div>

          {/* Data Disclosure */}
          <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3">
            <div className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-200 space-y-1" data-testid="ai-data-disclosure">
              <p>
                <span className="font-semibold">Sent to the provider (Google or OpenAI), only when you use an AI feature:</span>
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  AI query or formula: what you typed, the dataset name, every column&apos;s name and type, the
                  first 5 rows&apos; values of every column, each column&apos;s min/max and distinct count, and your
                  calculated fields&apos; names and formulas.
                </li>
                <li>
                  Executive summary: the dataset name, row and chart counts, column names and types, the active
                  filters (including the category values you filtered on) and the anomaly descriptions (column,
                  category and value).
                </li>
              </ul>
              <p>
                Values can come from any column, so avoid AI features on datasets with names, contact details,
                health or other personal data. Your API key is stored in this browser&apos;s localStorage and
                sent only to that provider.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={() => {
              setIsOpen(false);
              setIsPrivacyOpen(true);
            }}
            data-testid="settings-open-privacy"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Data &amp; privacy: clear all local data…
          </Button>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => {
                setIsOpen(false);
                resetTour();
              }}
            >
              <HelpCircle className="h-3.5 w-3.5 text-primary" />
              Restart Tutorial
            </Button>
            
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="premium" size="sm" onClick={handleSave} className="gap-1.5">
                    {isSaved ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    Save Configuration
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Save provider choice and key to local storage</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AiSettingsModal;
