import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/shared/lib/db";
import { resetDb } from "@/test/fakeDb";
import { useCopilotStore, CHAT_MAX_MESSAGES, type CopilotMessage } from "../copilot/copilotStore";
import { deleteChat, loadChat, resetChatHistoryForTests, saveChatNow, toStoredMessages, RESULT_PREVIEW_CHARS } from "../copilot/chatHistory";
import { conversation, CONTEXT_TURNS } from "../copilot/copilotSession";

/** Saved copilot chats (copilot/chatHistory.ts): save, restore, cap, delete paths; and the context window sent to the model. */

vi.mock("@/shared/hooks/use-toast", () => ({ toast: vi.fn() }));

const user = (id: string, text = `question ${id}`): CopilotMessage => ({ id, role: "user", text });
const answer = (id: string, text = `answer ${id}`, extra: Partial<CopilotMessage> = {}): CopilotMessage => ({ id, role: "assistant", text, status: "done", ...extra });

beforeEach(async () => {
  resetChatHistoryForTests();
  useCopilotStore.setState({ chats: {} });
  await resetDb();
});

describe("chat history: save and restore", () => {
  it("a chat is saved (debounced) once its dataset's saved chat has been read, and restored after a 'reload'", async () => {
    await loadChat("ds1");
    useCopilotStore.getState().addMessage("ds1", user("u1", "average Rating by Category?"));
    useCopilotStore.getState().addMessage("ds1", answer("a1", "**GAME** leads."));
    await vi.waitFor(async () => expect((await db.copilotChats.get("ds1"))?.messages).toHaveLength(2), { timeout: 3000 });

    // Reload: memory is empty and nothing has been read yet.
    resetChatHistoryForTests();
    useCopilotStore.setState({ chats: {} });
    await loadChat("ds1");
    expect(useCopilotStore.getState().chats.ds1.map((m) => m.text)).toEqual(["average Rating by Category?", "**GAME** leads."]);
  });

  it("messages sent while the saved chat loads stay, after the saved ones, and nothing is overwritten before the read", async () => {
    await db.copilotChats.put({ datasetId: "ds1", messages: [user("old"), answer("olda")], updatedAt: 1 });
    useCopilotStore.getState().addMessage("ds1", user("new"));
    await saveChatNow("ds1"); // before the read: refused
    expect((await db.copilotChats.get("ds1"))?.messages).toHaveLength(2);
    await loadChat("ds1");
    expect(useCopilotStore.getState().chats.ds1.map((m) => m.id)).toEqual(["old", "olda", "new"]);
    await saveChatNow("ds1");
    expect(((await db.copilotChats.get("ds1"))?.messages as CopilotMessage[]).map((m) => m.id)).toEqual(["old", "olda", "new"]);
  });

  it("stored form: a streaming answer is saved as stopped, retry flags dropped, step results cut to a preview, proposals kept", () => {
    const big = { rows: Array.from({ length: 50 }, (_, i) => ({ Category: `C${i}`, avg_Rating: 4.1 })) };
    const proposal = { id: "p1", kind: "kpi" as const, description: "KPI card: average Rating", columns: ["Rating"], status: "applied" as const, applied: { kpiId: "k1", dashboardId: "d1" } };
    const [m] = toStoredMessages([
      answer("a1", "partial", {
        status: "streaming",
        retrying: true,
        retryReason: "busy",
        steps: [
          { id: "s1", name: "aggregate", ok: true, summary: "average Rating by Category · 50 rows", args: { groupBy: { column: "Category" } }, result: big },
          { id: "s2", name: "propose_kpi", ok: true, summary: "proposed", args: { column: "Rating" }, result: { proposed: "x" }, proposal },
        ],
      }),
    ]);
    expect(m.status).toBe("stopped");
    expect(m).not.toHaveProperty("retrying");
    expect(m).not.toHaveProperty("retryReason");
    expect(typeof m.steps![0].result).toBe("string");
    expect((m.steps![0].result as string).length).toBe(RESULT_PREVIEW_CHARS + 1);
    expect(m.steps![0].args).toEqual({ groupBy: { column: "Category" } });
    expect(m.steps![1].result).toEqual({ proposed: "x" });
    expect(m.steps![1].proposal).toEqual(proposal);
  });
});

describe("chat history: cap", () => {
  it(`keeps the last ${CHAT_MAX_MESSAGES} messages in memory and when saved`, async () => {
    await loadChat("ds1");
    for (let i = 0; i < 60; i++) useCopilotStore.getState().addMessage("ds1", i % 2 ? answer(`m${i}`) : user(`m${i}`));
    const list = useCopilotStore.getState().chats.ds1;
    expect(list).toHaveLength(CHAT_MAX_MESSAGES);
    expect(list[0].id).toBe("m10");
    await saveChatNow("ds1");
    const saved = (await db.copilotChats.get("ds1"))!.messages as CopilotMessage[];
    expect(saved).toHaveLength(CHAT_MAX_MESSAGES);
    expect(saved[49].id).toBe("m59");
    expect(toStoredMessages(Array.from({ length: 70 }, (_, i) => user(`x${i}`)))).toHaveLength(CHAT_MAX_MESSAGES);
  });

  it(`the model gets only the last ${CONTEXT_TURNS} turns, starting on a question`, () => {
    const list: CopilotMessage[] = [];
    for (let i = 0; i < 15; i++) list.push(user(`u${i}`), answer(`a${i}`));
    const sent = conversation(list);
    expect(sent).toHaveLength(20);
    expect(sent[0]).toEqual({ role: "user", content: "question u5" });
    expect(sent[19]).toEqual({ role: "assistant", content: "answer a14" });
    // Failed answers are left out; a short chat is sent whole.
    expect(conversation([user("q"), answer("e", "", { status: "error" }), user("q2")])).toEqual([
      { role: "user", content: "question q" },
      { role: "user", content: "question q2" },
    ]);
  });
});

describe("chat history: delete paths", () => {
  it("Clear chat (empty chat) deletes the saved record", async () => {
    await loadChat("ds1");
    useCopilotStore.getState().addMessage("ds1", user("u1"));
    await saveChatNow("ds1");
    expect(await db.copilotChats.get("ds1")).toBeDefined();
    useCopilotStore.getState().clearChat("ds1");
    await vi.waitFor(async () => expect(await db.copilotChats.get("ds1")).toBeUndefined());
  });

  it("deleting a dataset deletes its chat from memory and IndexedDB, and a pending save can't bring it back", async () => {
    await loadChat("ds1");
    await loadChat("ds2");
    useCopilotStore.getState().addMessage("ds1", user("u1"));
    useCopilotStore.getState().addMessage("ds2", user("keep"));
    await saveChatNow("ds1");
    await saveChatNow("ds2");
    useCopilotStore.getState().addMessage("ds1", user("u2")); // a save is now pending
    await deleteChat("ds1");
    await new Promise((r) => setTimeout(r, 600));
    expect(useCopilotStore.getState().chats.ds1).toBeUndefined();
    expect(await db.copilotChats.get("ds1")).toBeUndefined();
    expect(await db.copilotChats.get("ds2")).toBeDefined();
  });

  it("datasetStore.deleteDataset deletes the dataset's chat", async () => {
    const { useDatasetStore } = await import("@/store/datasetStore");
    useDatasetStore.setState({ datasets: [{ id: "ds1", name: "a", data: [], columns: [], columnTypes: {} }], activeDataset: null });
    await db.copilotChats.put({ datasetId: "ds1", messages: [user("u1")], updatedAt: 1 });
    useCopilotStore.setState({ chats: { ds1: [user("u1")] } });
    useDatasetStore.getState().deleteDataset("ds1");
    await vi.waitFor(async () => expect(await db.copilotChats.get("ds1")).toBeUndefined());
    expect(useCopilotStore.getState().chats.ds1).toBeUndefined();
  });

  it('"Clear all local data" deletes all chats and no pending save recreates them', async () => {
    const { clearAllLocalData, CLEARED_ITEMS } = await import("@/shared/services/clearLocalData");
    expect(CLEARED_ITEMS).toContain("Copilot chats");
    await loadChat("ds1");
    useCopilotStore.getState().addMessage("ds1", user("u1"));
    await saveChatNow("ds1");
    useCopilotStore.getState().addMessage("ds1", user("u2")); // pending
    vi.stubGlobal("localStorage", { length: 0, key: () => null, removeItem: () => {} });
    vi.stubGlobal("sessionStorage", { length: 0, key: () => null, removeItem: () => {} });
    await clearAllLocalData(() => {});
    vi.unstubAllGlobals();
    await new Promise((r) => setTimeout(r, 600));
    await db.open();
    expect(await db.copilotChats.count()).toBe(0);
    const { persistenceService } = await import("@/shared/services/persistenceService");
    persistenceService.stopped = false;
  });
});

describe("chats are never exported", () => {
  it("no export or PDF code reads the copilotChats table", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "../../..");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) {
          if (f !== "__tests__") walk(p);
        } else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      }
    };
    walk(root);
    const readers = files.filter((f) => readFileSync(f, "utf8").includes("copilotChats")).map((f) => f.slice(root.length + 1));
    expect(readers.sort()).toEqual(["features/ai/copilot/chatHistory.ts", "shared/lib/db.ts"]);
  });
});
