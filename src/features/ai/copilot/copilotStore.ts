/**
 * Copilot panel state. In the startup bundle (small, no AI code): open/closed, the docked
 * width (remembered in localStorage `datavista-copilot`), the chat per dataset (saved in
 * IndexedDB by copilot/chatHistory.ts, at most CHAT_MAX_MESSAGES each), and a question
 * handed over from elsewhere (the Ctrl+K palette's "/ai ...") for the panel to send.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Proposal } from "./actions";

export const COPILOT_MIN_WIDTH = 320;
export const COPILOT_MAX_WIDTH = 560;
export const COPILOT_DEFAULT_WIDTH = 400;
/** Messages kept per dataset's chat (in memory and saved); older ones drop off. */
export const CHAT_MAX_MESSAGES = 50;

const capped = (list: CopilotMessage[]) => (list.length > CHAT_MAX_MESSAGES ? list.slice(-CHAT_MAX_MESSAGES) : list);

export interface CopilotStepView {
  id: string;
  name: string;
  ok: boolean;
  summary: string;
  args: unknown;
  result: unknown;
  /** An action the model proposed: rendered as a card with Apply / Dismiss (copilot/actions.ts). */
  proposal?: Proposal;
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
  /** Patches one proposal card (Apply / Dismiss / Undo) inside a message's steps. */
  updateProposal: (datasetId: string, messageId: string, proposalId: string, patch: Partial<Proposal>) => void;
  /** Puts a chat loaded from IndexedDB in front of anything sent while it loaded. */
  restoreChat: (datasetId: string, saved: CopilotMessage[]) => void;
  /** Forgets a dataset's chat (the dataset was deleted). */
  removeChat: (datasetId: string) => void;
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
      addMessage: (datasetId, m) => set((s) => ({ chats: { ...s.chats, [datasetId]: capped([...(s.chats[datasetId] ?? []), m]) } })),
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
      updateProposal: (datasetId, messageId, proposalId, patch) =>
        get().updateMessage(datasetId, messageId, (m) => ({
          steps: m.steps?.map((st) => (st.proposal?.id === proposalId ? { ...st, proposal: { ...st.proposal, ...patch } } : st)),
        })),
      restoreChat: (datasetId, saved) =>
        set((s) => {
          const current = s.chats[datasetId] ?? [];
          const ids = new Set(current.map((m) => m.id));
          return { chats: { ...s.chats, [datasetId]: capped([...saved.filter((m) => !ids.has(m.id)), ...current]) } };
        }),
      removeChat: (datasetId) =>
        set((s) => {
          const { [datasetId]: _gone, ...rest } = s.chats;
          return { chats: rest };
        }),
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
