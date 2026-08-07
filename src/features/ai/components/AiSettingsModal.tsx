import { useState, useEffect } from "react";
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
import { Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components/ui/tooltip";
import { Sparkles, Key, Eye, EyeOff, Check, Cpu, HelpCircle } from "lucide-react";
import { useUiStore, LlmProvider } from "@/store/uiStore";
import { toast } from "@/shared/hooks/use-toast";

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

  const { llmApiKey, llmProvider, setLlmApiKey, setLlmProvider, resetTour } = useUiStore();

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
                    {providerInput === "gemini" && <Badge variant="secondary" className="text-[9px] px-1 py-0">Active</Badge>}
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
                    {providerInput === "openai" && <Badge variant="secondary" className="text-[9px] px-1 py-0">Active</Badge>}
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{showKey ? "Hide API key" : "Show API key"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {apiKeyInput ? (
                <span className="text-emerald-500 font-medium flex items-center gap-1">
                  <Check className="h-3 w-3" /> Key saved locally in offline browser storage.
                </span>
              ) : (
                "Leave blank to use the built-in offline smart heuristic engine."
              )}
            </p>
          </div>

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
