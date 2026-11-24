/**
 * Saves each dataset's copilot chat in IndexedDB (`copilotChats`, one record per dataset) and
 * restores it when the dataset's chat is opened. In the startup bundle (small: the database
 * and the copilot store only) because deleting a dataset and "Clear all local data" must reach
 * it without loading the copilot.
 *  - What is kept: the last CHAT_MAX_MESSAGES messages with their query steps and action
 *    proposals; a step's result is cut to a short text preview (the full numbers are in the
 *    answer text). An answer still streaming is saved as stopped.
 *  - Writes are debounced per dataset, so a streaming answer isn't written on every chunk.
 *  - Clear chat (empty chat) deletes the record; deleting a dataset deletes it; "Clear all
 *    local data" stops all writes before it deletes the database, so a pending save can't
 *    recreate it.
 * Chats are never part of an export or PDF: nothing outside this module reads the table.
 */
import { db } from "@/shared/lib/db";
import { CHAT_MAX_MESSAGES, useCopilotStore, type CopilotMessage } from "./copilotStore";

export const SAVE_DEBOUNCE_MS = 400;
/** Characters of a step's result kept when saved. */
export const RESULT_PREVIEW_CHARS = 300;
const ARGS_MAX_CHARS = 1000;

let stopped = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Datasets whose saved chat has been read: only these are written (a write before the read would replace it). */
const loaded = new Set<string>();
const loading = new Map<string, Promise<void>>();

function preview(v: unknown, max: number): unknown {
  if (v === undefined) return v;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s === undefined) return v;
  if (s.length <= max) return typeof v === "string" ? v : JSON.parse(s);
  return `${s.slice(0, max)}…`;
}

/** A chat as saved: capped, step results cut to a preview, nothing in flight. */
export function toStoredMessages(list: CopilotMessage[]): CopilotMessage[] {
  return list.slice(-CHAT_MAX_MESSAGES).map((m) => {
    const { retrying: _r, retryReason: _rr, ...rest } = m;
    const out: CopilotMessage = { ...rest };
    if (out.status === "streaming") out.status = "stopped";
    if (out.steps) {
      out.steps = out.steps.map((st) => ({
        ...st,
        args: preview(st.args, ARGS_MAX_CHARS),
        result: preview(st.result, RESULT_PREVIEW_CHARS),
      }));
    }
    return out;
  });
}

function cancel(datasetId: string) {
  const t = timers.get(datasetId);
  if (t !== undefined) clearTimeout(t);
  timers.delete(datasetId);
}

/** Writes (or, for an empty chat, deletes) one dataset's chat now. */
export async function saveChatNow(datasetId: string): Promise<void> {
  cancel(datasetId);
  if (stopped || !loaded.has(datasetId)) return;
  const list = useCopilotStore.getState().chats[datasetId];
  if (list === undefined) return;
  try {
    if (list.length === 0) await db.copilotChats.delete(datasetId);
    else await db.copilotChats.put({ datasetId, messages: toStoredMessages(list), updatedAt: Date.now() });
  } catch (e) {
    console.error("Failed to save the copilot chat:", e);
  }
}

function scheduleSave(datasetId: string) {
  if (stopped || !loaded.has(datasetId)) return;
  cancel(datasetId);
  timers.set(datasetId, setTimeout(() => void saveChatNow(datasetId), SAVE_DEBOUNCE_MS));
}

/**
 * Restores a dataset's saved chat into the store (once per dataset per page). Messages sent
 * while it loaded stay, after the saved ones.
 */
export function loadChat(datasetId: string): Promise<void> {
  if (!datasetId || loaded.has(datasetId)) return Promise.resolve();
  const pending = loading.get(datasetId);
  if (pending) return pending;
  const p = (async () => {
    try {
      const rec = await db.copilotChats.get(datasetId);
      if (rec?.messages.length) useCopilotStore.getState().restoreChat(datasetId, rec.messages as CopilotMessage[]);
    } catch (e) {
      console.error("Failed to load the copilot chat:", e);
    } finally {
      loading.delete(datasetId);
      loaded.add(datasetId);
      // Anything sent while loading (or the merged chat) is written now that the read is done.
      if (useCopilotStore.getState().chats[datasetId]?.length) scheduleSave(datasetId);
    }
  })();
  loading.set(datasetId, p);
  return p;
}

/** The dataset was deleted: its chat goes from memory and from IndexedDB. */
export async function deleteChat(datasetId: string): Promise<void> {
  cancel(datasetId);
  loaded.delete(datasetId);
  useCopilotStore.getState().removeChat(datasetId);
  if (stopped) return;
  try {
    await db.copilotChats.delete(datasetId);
  } catch (e) {
    console.error("Failed to delete the copilot chat:", e);
  }
}

/** "Clear all local data": no chat write after this (the database is about to be deleted). */
export function stopChatWrites(): void {
  stopped = true;
  for (const id of [...timers.keys()]) cancel(id);
}

/** Undoes stopChatWrites when the database could not be deleted. */
export function resumeChatWrites(): void {
  stopped = false;
}

/** Test hook: forget which chats were read. */
export function resetChatHistoryForTests(): void {
  for (const id of [...timers.keys()]) cancel(id);
  loaded.clear();
  loading.clear();
  stopped = false;
}

// Save on every change to a chat (debounced); an emptied chat (Clear chat) is deleted at once.
let previous = useCopilotStore.getState().chats;
useCopilotStore.subscribe((state) => {
  const chats = state.chats;
  if (chats === previous) return;
  const before = previous;
  previous = chats;
  for (const [id, list] of Object.entries(chats)) {
    if (list === before[id]) continue;
    if (list.length === 0) void saveChatNow(id);
    else scheduleSave(id);
  }
});
