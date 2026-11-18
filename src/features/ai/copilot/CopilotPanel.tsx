/**
 * The copilot's contents (lazy chunk): header, chat (streamed Markdown answers with their
 * query steps), starter questions, and the question box. The frame around it (docked aside
 * or phone sheet) is CopilotHost. The chat sits on a solid surface (long text, every theme);
 * the header and footer are on the panel's glass. With no dataset it shows a short empty
 * state (Upload / Try sample). A question queued by the palette ("/ai ...",
 * copilotStore.ask) is sent once the panel is ready.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Copy, Database, RotateCcw, Send, Settings2, Sparkles, Square, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useDatasetStore } from "@/store/datasetStore";
import { useUiStore } from "@/store/uiStore";
import { ConnectProviderCard } from "../components/ConnectProviderCard";
import { useAiConnected, useAiSettingsStore, useProviderLabel } from "../settings/aiSettingsStore";
import { privacyLevelLabel, privacyLevelSends } from "../privacy/levels";
import { starterQuestions, toolsEnabled } from "./context";
import { askCopilot } from "./copilotSession";
import { useCopilotStore, type CopilotMessage, type CopilotStepView } from "./copilotStore";
import { Markdown } from "./Markdown";
import { loadSampleDataset } from "@/features/datasets/sampleData";

/** No output (text, query step or retry) for this long: "Still waiting for <provider>…". */
export const STILL_WAITING_MS = 15_000;

const EMPTY: CopilotMessage[] = [];

function json(v: unknown, max = 4000): string {
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return s.length > max ? `${s.slice(0, max)}\n…` : s;
}

function Step({ step }: { step: CopilotStepView }) {
  return (
    <details className="group rounded-md border border-border bg-muted/40 text-xs" data-testid="copilot-step">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-muted-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
        <span className={step.ok ? "" : "text-destructive"}>{step.ok ? `Ran: ${step.summary}` : `Query error: ${step.summary.replace(/^[a-z_]+: /, "")}`}</span>
      </summary>
      <div className="space-y-1.5 border-t border-border px-2 py-2">
        <p className="font-semibold text-foreground">Arguments ({step.name})</p>
        <pre role="region" tabIndex={0} aria-label={`Arguments of ${step.name}`} className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background p-1.5 font-mono text-[11px] text-foreground" data-testid="copilot-step-args">{json(step.args)}</pre>
        <p className="font-semibold text-foreground">Result</p>
        <pre role="region" tabIndex={0} aria-label={`Result of ${step.name}`} className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-background p-1.5 font-mono text-[11px] text-foreground" data-testid="copilot-step-result">{json(step.result)}</pre>
      </div>
    </details>
  );
}

function IconButton({ label, onClick, children, testId }: { label: string; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={onClick} data-testid={testId}>
      {children}
      {label}
    </Button>
  );
}

/** True after STILL_WAITING_MS with no new output while `busy`; any output restarts the wait. */
function useStillWaiting(busy: boolean, signature: string): boolean {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    setWaiting(false);
    if (!busy) return;
    const timer = setTimeout(() => setWaiting(true), STILL_WAITING_MS);
    return () => clearTimeout(timer);
  }, [busy, signature]);
  return waiting;
}

function Answer({ m, onRetry, onStop, providerLabel }: { m: CopilotMessage; onRetry: () => void; onStop: () => void; providerLabel: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };
  const busy = m.status === "streaming";
  const waiting = useStillWaiting(busy, `${m.text.length}|${m.steps?.length ?? 0}|${m.retrying ? 1 : 0}`);
  return (
    <div className="space-y-2" data-testid="copilot-answer" aria-busy={busy}>
      {m.steps?.map((s) => <Step key={s.id} step={s} />)}
      {m.retrying && (
        <p className="text-xs text-muted-foreground" role="status" data-testid="copilot-retrying">
          {m.retryReason === "timeout" ? `No answer from ${providerLabel} yet, retrying…` : "Provider busy, retrying…"}
        </p>
      )}
      {m.text ? <Markdown text={m.text} /> : busy && !m.retrying && !waiting ? <p className="text-sm text-muted-foreground">Thinking…</p> : null}
      {waiting && (
        <div className="flex items-center gap-2" role="status" data-testid="copilot-still-waiting">
          <p className="text-sm text-muted-foreground">Still waiting for {providerLabel}…</p>
          <IconButton label="Stop" onClick={onStop} testId="copilot-waiting-stop">
            <Square className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
        </div>
      )}
      {m.status === "error" && (
        <p className="text-sm text-destructive" role="alert" data-testid="copilot-error">
          {m.error}
        </p>
      )}
      {m.status === "stopped" && <p className="text-xs text-muted-foreground">Stopped.</p>}
      {m.note && (
        <p className="text-xs text-muted-foreground" data-testid="copilot-note">
          {m.note}
        </p>
      )}
      {!busy && (
        <div className="flex gap-1">
          {m.text && (
            <IconButton label={copied ? "Copied" : "Copy"} onClick={copy} testId="copilot-copy">
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            </IconButton>
          )}
          <IconButton label="Retry" onClick={onRetry} testId="copilot-retry">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
        </div>
      )}
    </div>
  );
}

type PanelProps = { onClose: () => void; title: (children: ReactNode) => ReactNode };

/** No dataset yet (Ctrl+J or the sidebar's Co-Pilot button): what to do first. */
function NoDataset({ onClose, title }: PanelProps) {
  const setActiveView = useUiStore((s) => s.setActiveView);
  const sampleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => sampleRef.current?.focus(), []);
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="copilot-empty">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden />
        {title(<span className="text-sm font-semibold text-foreground">Copilot</span>)}
        <Button type="button" variant="ghost" size="icon" className="ml-auto h-8 w-8 text-frame-muted hover:text-foreground" onClick={onClose} aria-label="Close copilot" data-testid="copilot-close">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <div className="surface-solid m-2 space-y-3 rounded-lg p-4 text-foreground">
        <p className="text-sm font-semibold">Load a dataset to start</p>
        <p className="text-sm text-muted-foreground">The copilot answers questions about the dataset you have open.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setActiveView("upload");
              onClose();
            }}
            data-testid="copilot-empty-upload"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
            Upload
          </Button>
          <Button ref={sampleRef} type="button" size="sm" className="gap-1.5" onClick={() => loadSampleDataset()} data-testid="copilot-empty-sample">
            <Database className="h-3.5 w-3.5" aria-hidden />
            Try sample
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CopilotPanel(props: PanelProps) {
  const hasDataset = useDatasetStore((s) => s.activeDataset !== null);
  return hasDataset ? <CopilotChat {...props} /> : <NoDataset {...props} />;
}

function CopilotChat({ onClose, title }: PanelProps) {
  const dataset = useDatasetStore((s) => s.activeDataset);
  const datasetId = dataset?.id ?? "";
  const messages = useCopilotStore((s) => s.chats[datasetId] ?? EMPTY);
  const truncateFrom = useCopilotStore((s) => s.truncateFrom);
  const clearChat = useCopilotStore((s) => s.clearChat);
  const connected = useAiConnected();
  const providerLabel = useProviderLabel();
  const privacy = useAiSettingsStore((s) => s.privacy);
  const openSettings = useUiStore((s) => s.setIsAiSettingsOpen);
  const [draft, setDraft] = useState("");
  const [controller, setController] = useState<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const starters = useMemo(() => (dataset ? starterQuestions(dataset) : []), [dataset]);
  const busy = controller !== null;

  const rootRef = useRef<HTMLDivElement>(null);
  // Focus the question box, or the Connect button when no provider is connected (the box is disabled).
  useEffect(() => {
    const input = inputRef.current;
    if (input && !input.disabled) input.focus();
    else rootRef.current?.querySelector<HTMLElement>("[data-testid='connect-provider-open']")?.focus();
    // Once, on open.
  }, []);

  // Keep the newest text in view while it streams.
  const last = messages[messages.length - 1];
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, last?.text, last?.steps?.length]);

  // Stop a running answer when the panel goes away.
  useEffect(() => () => controller?.abort(), [controller]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy || !connected || !dataset) return;
    setDraft("");
    const c = new AbortController();
    setController(c);
    try {
      await askCopilot(q, c.signal);
    } finally {
      setController(null);
    }
  };

  // A question from the palette ("/ai ..."): taken from the store before sending, so it is sent once.
  const pending = useCopilotStore((s) => s.pendingQuestion);
  useEffect(() => {
    if (!pending || busy || !connected || !dataset) return;
    const q = useCopilotStore.getState().takePendingQuestion();
    if (q) void send(q);
    // send is recreated each render; the trigger is a new pending question or the panel becoming free.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, busy, connected, dataset]);

  const retry = (answer: CopilotMessage) => {
    const i = messages.findIndex((m) => m.id === answer.id);
    const question = [...messages.slice(0, i)].reverse().find((m) => m.role === "user");
    if (!question || busy) return;
    truncateFrom(datasetId, question.id);
    void send(question.text);
  };

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden />
        {title(<span className="text-sm font-semibold text-foreground">Copilot</span>)}
        <button
          type="button"
          onClick={() => openSettings(true)}
          className="ml-1 truncate rounded-full border border-border px-2 py-0.5 text-xs text-frame-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="copilot-privacy"
          title="Privacy level (AI settings)"
        >
          Privacy: {privacyLevelLabel(privacy.level)}
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-frame-muted hover:text-foreground" onClick={() => openSettings(true)} aria-label="AI settings">
            <Settings2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-frame-muted hover:text-foreground" onClick={() => clearChat(datasetId)} aria-label="Clear chat" disabled={busy || messages.length === 0}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-frame-muted hover:text-foreground" onClick={onClose} aria-label="Close copilot" data-testid="copilot-close">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {/* The scrolling log takes focus so keyboard users can scroll it (axe scrollable-region-focusable). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div ref={listRef} className="surface-solid m-2 min-h-0 flex-1 overflow-y-auto rounded-lg p-3 text-foreground" role="log" aria-label="Copilot conversation" aria-live="polite" data-testid="copilot-log" tabIndex={0}>
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Ask about <span className="font-semibold">{dataset?.name}</span>.{" "}
              {toolsEnabled(privacy)
                ? "The copilot can run queries on the full dataset in this browser; only their results are sent."
                : "At this privacy level the copilot answers from the dataset summary only."}
            </p>
            {starters.length > 0 && (
              <ul className="space-y-1.5" aria-label="Suggested questions">
                {starters.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      onClick={() => void send(q)}
                      disabled={!connected || busy}
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-accent disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="copilot-starter"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="ml-6 whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground" data-testid="copilot-question">
                  {m.text}
                </div>
              ) : (
                <Answer key={m.id} m={m} onRetry={() => retry(m)} onStop={() => controller?.abort()} providerLabel={providerLabel} />
              )
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 px-3 pb-3">
        {!connected ? (
          <ConnectProviderCard feature="the copilot" note="Until then nothing is sent." />
        ) : (
          <p className="text-xs text-frame-muted">
            Sends your question and this dataset&apos;s {privacyLevelSends(privacy.level)} to {providerLabel}.
          </p>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <label htmlFor="copilot-input" className="sr-only">
            Ask the copilot
          </label>
          <textarea
            id="copilot-input"
            ref={inputRef}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            placeholder={connected ? "Ask about your data…" : "Connect a provider to ask"}
            disabled={!connected}
            className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            data-testid="copilot-input"
          />
          {busy ? (
            <Button type="button" variant="outline" size="icon" onClick={() => controller?.abort()} aria-label="Stop" data-testid="copilot-stop">
              <Square className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label="Send" disabled={!connected || !draft.trim()} data-testid="copilot-send">
              <Send className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
