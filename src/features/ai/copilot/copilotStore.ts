/**
 * Copilot panel state. In the startup bundle (small, no AI code): open/closed, the docked
 * width (remembered in localStorage `datavista-copilot`), the chat per dataset, held in
 * memory only for now (cleared on reload), and a question handed over from elsewhere (the
 * Ctrl+K palette's "/ai ...") for the panel to send.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export const COPILOT_MIN_WIDTH = 320;
export const COPILOT_MAX_WIDTH = 560;
export const COPILOT_DEFAULT_WIDTH = 400;

export interface CopilotStepView {
  id: string;
  name: string;
  ok: boolean;
  summary: string;
  args: unknown;
  result: unknown;
}

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  steps?: CopilotStepView[];
  status?: "streaming" | "done" | "error" | "stopped";
  error?: string;
  /** One-line note under the answer ("This model can't run queries..."). */
  note?: string;
  /** Shown while the request is being retried: the provider was busy (503/429) or gave no answer in time. */
  retrying?: boolean;
  retryReason?: "busy" | "timeout";
}

interface CopilotState {
  open: boolean;
  width: number;
  /** Chats by dataset id. */
  chats: Record<string, CopilotMessage[]>;
  /** A question to send as soon as the panel is ready (CopilotPanel takes it). */
  pendingQuestion: string | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Opens the panel and queues `question` for it to send. */
  ask: (question: string) => void;
  takePendingQuestion: () => string | null;
  setWidth: (w: number) => void;
  addMessage: (datasetId: string, m: CopilotMessage) => void;
  updateMessage: (datasetId: string, id: string, patch: Partial<CopilotMessage> | ((m: CopilotMessage) => Partial<CopilotMessage>)) => void;
  /** Removes `id` and every message after it (retry). */
  truncateFrom: (datasetId: string, id: string) => void;
  clearChat: (datasetId: string) => void;
}

export function clampCopilotWidth(w: number): number {
  if (!Number.isFinite(w)) return COPILOT_DEFAULT_WIDTH;
  return Math.min(COPILOT_MAX_WIDTH, Math.max(COPILOT_MIN_WIDTH, Math.round(w)));
}

export const useCopilotStore = create<CopilotState>()(
  persist(
    (set, get) => ({
      open: false,
      width: COPILOT_DEFAULT_WIDTH,
      chats: {},
      pendingQuestion: null,
      setOpen: (open) => set({ open }),
      toggle: () => set((s) => ({ open: !s.open })),
      ask: (question) => set({ open: true, pendingQuestion: question.trim() || null }),
      takePendingQuestion: () => {
        const q = get().pendingQuestion;
        if (q !== null) set({ pendingQuestion: null });
        return q;
      },
      setWidth: (w) => set({ width: clampCopilotWidth(w) }),
      addMessage: (datasetId, m) => set((s) => ({ chats: { ...s.chats, [datasetId]: [...(s.chats[datasetId] ?? []), m] } })),
      updateMessage: (datasetId, id, patch) =>
        set((s) => ({
          chats: {
            ...s.chats,
            [datasetId]: (s.chats[datasetId] ?? []).map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)),
          },
        })),
      truncateFrom: (datasetId, id) =>
        set((s) => {
          const list = s.chats[datasetId] ?? [];
          const i = list.findIndex((m) => m.id === id);
          return i === -1 ? s : { chats: { ...s.chats, [datasetId]: list.slice(0, i) } };
        }),
      clearChat: (datasetId) => set((s) => ({ chats: { ...s.chats, [datasetId]: [] } })),
    }),
    {
      name: "datavista-copilot",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Only the width is remembered; the chat stays in memory.
      partialize: (s) => ({ width: s.width }),
      merge: (persisted, current) => ({ ...current, width: clampCopilotWidth((persisted as { width?: number } | undefined)?.width ?? COPILOT_DEFAULT_WIDTH) }),
    }
  )
);
