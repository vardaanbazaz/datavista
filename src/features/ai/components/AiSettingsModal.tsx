import { useEffect, useId, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Hint } from "@/shared/components/Hint";
import { Sparkles, Key, Eye, EyeOff, Check, Cpu, HelpCircle, CloudOff, ShieldCheck, AlertTriangle, Loader2, RefreshCw, PlugZap, FileSearch } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { useDatasetStore } from "@/store/datasetStore";
import { toast } from "@/shared/hooks/use-toast";
import { PROVIDERS, browserAccessText, defaultModel, getProvider } from "@/features/ai/providers/registry";
import { PRIVACY_LEVELS, SAMPLE_ROWS_MAX, SAMPLE_ROWS_MIN, type PrivacyLevel } from "@/features/ai/privacy/levels";
import type { PiiKind } from "@/features/ai/privacy/pii";
import { isAiConnected, resolveConnection, useAiSettingsStore } from "@/features/ai/settings/aiSettingsStore";

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TestState = { status: "idle" } | { status: "running" } | { status: "ok"; text: string } | { status: "error"; text: string };

const PII_LABEL: Record<PiiKind, string> = { email: "emails", phone: "phone numbers", name: "person names" };

export function AiSettingsModal({ isOpen, onClose }: AiSettingsModalProps) {
  const ids = useId();
  const resetTour = useUiStore((s) => s.resetTour);
  const setIsPrivacyOpen = useUiStore((s) => s.setIsPrivacyOpen);
  const activeDataset = useDatasetStore((s) => s.activeDataset);

  const settings = useAiSettingsStore(
    useShallow((s) => ({
      providerId: s.providerId,
      models: s.models,
      baseUrls: s.baseUrls,
      keys: s.keys,
      remembered: s.remembered,
      privacy: s.privacy,
    }))
  );
  const actions = useAiSettingsStore(
    useShallow((s) => ({
      setProvider: s.setProvider,
      setModel: s.setModel,
      setBaseUrl: s.setBaseUrl,
      setKey: s.setKey,
      forgetKey: s.forgetKey,
      setPrivacyLevel: s.setPrivacyLevel,
      setSampleRows: s.setSampleRows,
      setColumnUnmasked: s.setColumnUnmasked,
    }))
  );

  const [providerId, setProviderId] = useState(settings.providerId);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loadedModels, setLoadedModels] = useState<string[] | null>(null);
  const [modelsState, setModelsState] = useState<TestState>({ status: "idle" });
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [personal, setPersonal] = useState<[string, PiiKind][]>([]);

  const provider = getProvider(providerId);
  const savedConnection = resolveConnection(settings);
  const connected = isAiConnected(settings);

  /** Loads the drafts for a provider from what is saved. */
  const loadDraft = (id: string) => {
    const p = getProvider(id);
    setProviderId(p.id);
    setBaseUrl(p.id === "custom" ? settings.baseUrls[p.id] ?? "" : p.baseUrl);
    setApiKey(settings.keys[p.id] ?? "");
    setRemember(!!settings.remembered[p.id]);
    setModel(settings.models[p.id] || defaultModel(p));
    setLoadedModels(null);
    setModelsState({ status: "idle" });
    setTest({ status: "idle" });
    setPreview(null);
  };

  useEffect(() => {
    if (isOpen) loadDraft(settings.providerId);
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Columns of the active dataset that look like personal data (masked unless unmasked).
  useEffect(() => {
    if (!isOpen || !activeDataset) {
      setPersonal([]);
      return;
    }
    let cancelled = false;
    void import("@/features/ai/privacy/contextBuilder").then(({ detectPersonalColumns }) => {
      if (!cancelled) setPersonal([...detectPersonalColumns(activeDataset).entries()]);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeDataset]);

  const draftConnection = { provider, baseUrl: provider.id === "custom" ? baseUrl : provider.baseUrl, apiKey };
  const canCall = draftConnection.baseUrl.trim() !== "" && (!provider.keyRequired || apiKey.trim() !== "");
  const modelOptions = useMemo(() => loadedModels ?? provider.suggestedModels, [loadedModels, provider]);
  const hasSavedKey = !!settings.keys[provider.id];

  const handleLoadModels = async () => {
    setModelsState({ status: "running" });
    try {
      const { createChatClient } = await import("@/features/ai/client");
      const list = await createChatClient(draftConnection).listModels();
      setLoadedModels(list);
      setModelsState({ status: "ok", text: list.length ? `${list.length} models loaded.` : "The provider listed no models." });
    } catch (e) {
      const { describeAiError } = await import("@/features/ai/client");
      setModelsState({ status: "error", text: describeAiError(e, apiKey) });
    }
  };

  const handleTest = async () => {
    setTest({ status: "running" });
    try {
      const [{ createChatClient }, { requestOptions }] = await Promise.all([import("@/features/ai/client"), import("@/features/ai/aiRequests")]);
      await createChatClient(draftConnection).testConnection(requestOptions("query", model, provider.apiStyle));
      setTest({ status: "ok", text: `Connected: ${provider.label} answered with model “${model}”.` });
    } catch (e) {
      const { describeAiError } = await import("@/features/ai/client");
      setTest({ status: "error", text: describeAiError(e, apiKey) });
    }
  };

  const handlePreview = async () => {
    if (!activeDataset) return;
    setPreviewBusy(true);
    try {
      const { previewNextRequest } = await import("@/features/ai/aiRequests");
      const req = await previewNextRequest(activeDataset, { providerId: provider.id, model, baseUrl });
      setPreview(JSON.stringify({ method: "POST", url: req.url, headers: req.headers, body: req.body }, null, 2));
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleForget = () => {
    actions.forgetKey(provider.id);
    setApiKey("");
    setRemember(false);
    toast({ title: "Key forgotten", description: `The ${provider.label} key was removed from this browser.` });
  };

  const handleSave = () => {
    actions.setProvider(provider.id);
    actions.setModel(provider.id, model);
    if (provider.id === "custom") actions.setBaseUrl(provider.id, baseUrl);
    if (apiKey.trim() !== (settings.keys[provider.id] ?? "") || remember !== !!settings.remembered[provider.id]) {
      actions.setKey(provider.id, apiKey, remember);
    }
    toast({
      title: "AI settings saved",
      description: `${provider.label}, model ${model || "not set"}.${apiKey.trim() ? (remember ? " Key remembered on this device." : " Key kept for this session only.") : ""}`,
    });
    onClose();
  };

  const level = settings.privacy.level;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-6 text-foreground" data-testid="ai-settings-dialog">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-ink" aria-hidden />
            AI settings
          </DialogTitle>
          <DialogDescription className="text-sm text-frame-muted">
            Connect your own AI provider for plain-English queries, formulas and summaries. Nothing is sent until a provider is connected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-4">
          {/* Status reflects what is SAVED, not the drafts below. */}
          <div
            className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${connected ? "border-success/60" : "border-border bg-muted"}`}
            data-testid="ai-status"
          >
            {connected ? <Sparkles className="h-4 w-4 text-success shrink-0" aria-hidden /> : <CloudOff className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
            <p className={`text-sm font-medium ${connected ? "text-success" : "text-muted-foreground"}`}>
              {connected
                ? `Connected — ${savedConnection.provider.label} · ${savedConnection.model}`
                : "Not connected — offline insights only"}
            </p>
          </div>

          {/* Provider */}
          <div className="space-y-2">
            <Label htmlFor={`${ids}-provider`} className="text-sm font-medium flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-primary-ink" aria-hidden /> Provider
            </Label>
            <select
              id={`${ids}-provider`}
              value={provider.id}
              onChange={(e) => loadDraft(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="ai-provider"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.browserAccess.status === "needs-proxy" ? " — needs a proxy" : ""}
                </option>
              ))}
            </select>
            <p className={`text-xs ${provider.browserAccess.status === "needs-proxy" ? "text-destructive font-medium" : "text-frame-muted"}`}>
              {provider.browserAccess.status === "needs-proxy" && <AlertTriangle className="inline h-3 w-3 mr-1" aria-hidden />}
              {browserAccessText(provider)}
            </p>
            <p className="text-xs text-frame-muted">{provider.setupNote}</p>
          </div>

          {provider.id === "custom" && (
            <div className="space-y-2">
              <Label htmlFor={`${ids}-base`} className="text-sm font-medium">Base URL</Label>
              <Input
                id={`${ids}-base`}
                placeholder="https://my-server.example.com/v1"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="text-xs font-mono"
                data-testid="ai-base-url"
              />
            </div>
          )}

          {/* Key (not for keyless local servers) */}
          {(provider.keyRequired || provider.id === "custom") && (
            <div className="space-y-2">
              <Label htmlFor={`${ids}-key`} className="text-sm font-medium flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-primary-ink" aria-hidden /> API key{!provider.keyRequired && " (optional)"}
              </Label>
              <div className="relative flex items-center">
                <Input
                  id={`${ids}-key`}
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste your key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10 text-xs font-mono"
                  data-testid="ai-api-key"
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
              <div className="flex items-start gap-2">
                <input
                  id={`${ids}-remember`}
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                  data-testid="ai-remember-key"
                />
                <div className="space-y-0.5">
                  <label htmlFor={`${ids}-remember`} className="text-sm">Remember on this device</label>
                  <p className="text-xs text-frame-muted">
                    {remember
                      ? "Stored unencrypted in this browser's localStorage: anyone using this browser profile can read it."
                      : "Kept for this session only: closing the tab forgets it."}
                  </p>
                </div>
              </div>
              {hasSavedKey && (
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={handleForget} data-testid="ai-forget-key">
                  Forget key
                </Button>
              )}
            </div>
          )}

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor={`${ids}-model`} className="text-sm font-medium">Model</Label>
            <div className="flex gap-2">
              <Input
                id={`${ids}-model`}
                list={`${ids}-models`}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={provider.suggestedModels[0] ?? "model id"}
                className="text-xs font-mono"
                data-testid="ai-model"
              />
              <datalist id={`${ids}-models`}>
                {modelOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              {provider.modelsEndpoint && (
                <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1 text-xs h-10" onClick={handleLoadModels} disabled={!canCall || modelsState.status === "running"} data-testid="ai-load-models">
                  {modelsState.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                  Load models
                </Button>
              )}
            </div>
            {(modelsState.status === "ok" || modelsState.status === "error") && (
              <p className={`text-xs ${modelsState.status === "error" ? "text-destructive" : "text-frame-muted"}`} role="status">
                {modelsState.text}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleTest} disabled={!canCall || !model.trim() || test.status === "running"} data-testid="ai-test-connection">
              {test.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <PlugZap className="h-3.5 w-3.5" aria-hidden />}
              Test connection
            </Button>
            {(test.status === "ok" || test.status === "error") && (
              <p className={`text-xs font-medium ${test.status === "ok" ? "text-success" : "text-destructive"}`} role="status" data-testid="ai-test-result">
                {test.text}
              </p>
            )}
          </div>

          {/* Privacy level: applies at once to every AI request */}
          <fieldset className="space-y-2 rounded-lg border border-border p-3" data-testid="ai-privacy">
            <legend className="px-1 text-sm font-semibold flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary-ink" aria-hidden /> What AI requests may include
            </legend>
            {PRIVACY_LEVELS.map((l) => (
              <div key={l.id} className="flex items-start gap-2">
                <input
                  type="radio"
                  id={`${ids}-level-${l.id}`}
                  name={`${ids}-level`}
                  value={l.id}
                  checked={level === l.id}
                  onChange={() => actions.setPrivacyLevel(l.id as PrivacyLevel)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                  data-testid={`ai-level-${l.id}`}
                />
                <label htmlFor={`${ids}-level-${l.id}`} className="text-sm">
                  <span className="font-medium">{l.label}</span> <span className="text-frame-muted text-xs">{l.description}</span>
                </label>
              </div>
            ))}
            {level === "samples" && (
              <div className="space-y-1 pl-6">
                <label htmlFor={`${ids}-rows`} className="text-xs">
                  Rows sent: <span className="font-semibold tabular-nums">{settings.privacy.sampleRows}</span>
                </label>
                <input
                  id={`${ids}-rows`}
                  type="range"
                  min={SAMPLE_ROWS_MIN}
                  max={SAMPLE_ROWS_MAX}
                  step={10}
                  value={settings.privacy.sampleRows}
                  onChange={(e) => actions.setSampleRows(Number(e.target.value))}
                  className="w-full accent-primary"
                  data-testid="ai-sample-rows"
                />
              </div>
            )}
            <div className="space-y-1 pt-1">
              <p className="text-xs text-frame-muted">
                Columns that look like emails, phone numbers or person names are masked in top values, query results and sample rows, and the copilot can't group or filter on them (their names and types are still sent).
              </p>
              {activeDataset && personal.length === 0 && <p className="text-xs text-frame-muted">None found in “{activeDataset.name}”.</p>}
              {personal.map(([col, kind]) => {
                const unmasked = settings.privacy.unmasked.includes(col);
                return (
                  <div key={col} className="flex items-center gap-2 text-xs" data-testid={`ai-pii-${col}`}>
                    <input
                      type="checkbox"
                      id={`${ids}-unmask-${col}`}
                      checked={unmasked}
                      onChange={(e) => actions.setColumnUnmasked(col, e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    <label htmlFor={`${ids}-unmask-${col}`}>
                      Send “{col}” unmasked <span className="text-frame-muted">(looks like {PII_LABEL[kind]}; {unmasked ? "unmasked" : "masked"})</span>
                    </label>
                  </div>
                );
              })}
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handlePreview} disabled={!activeDataset || previewBusy} data-testid="ai-preview-button">
              <FileSearch className="h-3.5 w-3.5" aria-hidden />
              {activeDataset ? "Preview what will be sent" : "Load a dataset to preview what will be sent"}
            </Button>
            {preview && (
              // Scrollable, so it is a focusable labelled region (axe scrollable-region-focusable).
              <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted p-2 text-[11px] leading-snug whitespace-pre-wrap break-all" data-testid="ai-preview" tabIndex={0} role="region" aria-label="Next AI request">
                {preview}
              </pre>
            )}
          </fieldset>

          <p className="text-xs text-frame-muted" data-testid="ai-data-disclosure">
            Sent only to the provider above, and only when you use an AI feature: your question, the dataset name and what the privacy level allows. The key goes only to that provider and is never put in exports, PDFs or the saved workspace.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={() => {
              onClose();
              setIsPrivacyOpen(true);
            }}
            data-testid="settings-open-privacy"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Data &amp; privacy: clear all local data…
          </Button>

          <div className="flex items-center gap-2 justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                onClose();
                resetTour();
              }}
            >
              <HelpCircle className="h-3.5 w-3.5 text-primary-ink" />
              Restart Tutorial
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} className="gap-1.5" data-testid="ai-save">
                <Check className="h-4 w-4" />
                Save
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AiSettingsModal;
