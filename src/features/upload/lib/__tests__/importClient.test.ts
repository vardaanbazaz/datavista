import { describe, it, expect, vi } from "vitest";
import { importFile, ImportCancelled, ImportRejected, type WorkerLike } from "../importClient";
import { checkImportFile, formatSizeAgainstLimit, MAX_IMPORT_BYTES, LARGE_FILE_WARNING_BYTES } from "../importLimits";
import type { FromWorker, ToWorker } from "../importProtocol";

/** A File-shaped object whose size is a lie and whose contents must never be read. */
function fakeFile(name: string, size: number): File & { reads: number } {
  const f = { name, size, reads: 0 } as unknown as File & { reads: number };
  for (const m of ["text", "arrayBuffer", "slice", "stream"]) {
    (f as unknown as Record<string, () => never>)[m] = () => {
      f.reads++;
      throw new Error("read before the size check");
    };
  }
  return f;
}

class FakeWorker implements WorkerLike {
  sent: ToWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage(msg: ToWorker) { this.sent.push(msg); }
  terminate() { this.terminated = true; }
  emit(msg: FromWorker) { this.onmessage?.({ data: msg } as MessageEvent<FromWorker>); }
}

const handlers = () => ({
  onProgress: vi.fn(),
  chooseSheet: vi.fn(async () => null),
  review: vi.fn(async () => null),
});

describe("size cap", () => {
  it("rejects over the cap without reading or starting a worker", async () => {
    const file = fakeFile("creditcard.csv", 150_828_752);
    const createWorker = vi.fn(() => new FakeWorker());
    const job = importFile(file, handlers(), createWorker);
    await expect(job.promise).rejects.toBeInstanceOf(ImportRejected);
    await expect(job.promise).rejects.toThrow("This file is 150.8 MB. The maximum supported size is 100.0 MB");
    expect(createWorker).not.toHaveBeenCalled();
    expect(file.reads).toBe(0);
  });

  it("size and limit never read as equal", () => {
    expect(formatSizeAgainstLimit(MAX_IMPORT_BYTES + 1, MAX_IMPORT_BYTES)).toEqual({ size: "100.000001 MB", limit: "100.000000 MB" });
    expect(formatSizeAgainstLimit(MAX_IMPORT_BYTES + 40_000, MAX_IMPORT_BYTES)).toEqual({ size: "100.04 MB", limit: "100.00 MB" });
    expect(checkImportFile({ name: "a.csv", size: MAX_IMPORT_BYTES }).ok).toBe(true);
    expect(checkImportFile({ name: "a.csv", size: MAX_IMPORT_BYTES + 1 }).ok).toBe(false);
  });

  it("warns for large files and rejects unknown formats", () => {
    const big = checkImportFile({ name: "a.xlsx", size: LARGE_FILE_WARNING_BYTES + 1 });
    expect(big.ok && big.warning?.title).toBe("Large file");
    expect(checkImportFile({ name: "a.json", size: 10 }).ok).toBe(false);
  });
});

describe("importFile with a worker", () => {
  it("relays progress, then resolves with the dataset and terminates the worker", async () => {
    const worker = new FakeWorker();
    const h = handlers();
    const job = importFile(fakeFile("a.csv", 10), h, () => worker);
    expect(worker.sent[0].type).toBe("start");
    worker.emit({ type: "progress", stage: "parsing", fraction: 0.5 });
    expect(h.onProgress).toHaveBeenCalledWith("parsing", 0.5);
    const dataset = { id: "x", name: "a", data: [], columns: [], columnTypes: {} };
    worker.emit({ type: "done", dataset, sentAt: performance.timeOrigin + performance.now() });
    await expect(job.promise).resolves.toMatchObject({ dataset });
    expect(worker.terminated).toBe(true);
  });

  it("cancel terminates the worker and rejects with ImportCancelled", async () => {
    const worker = new FakeWorker();
    const job = importFile(fakeFile("a.csv", 10), handlers(), () => worker);
    worker.emit({ type: "progress", stage: "reading", fraction: 0.1 });
    job.cancel();
    await expect(job.promise).rejects.toBeInstanceOf(ImportCancelled);
    expect(worker.terminated).toBe(true);
    // Late messages from a terminated worker change nothing.
    worker.emit({ type: "done", dataset: { id: "x", name: "a", data: [], columns: [], columnTypes: {} }, sentAt: 0 });
    await expect(job.promise).rejects.toBeInstanceOf(ImportCancelled);
  });

  it("answering the sheet picker with null cancels", async () => {
    const worker = new FakeWorker();
    const job = importFile(fakeFile("a.xlsx", 10), handlers(), () => worker);
    worker.emit({ type: "sheets", sheets: [{ name: "A", rowCount: 1, headers: ["x"] }], canAppend: false });
    await expect(job.promise).rejects.toBeInstanceOf(ImportCancelled);
    expect(worker.terminated).toBe(true);
  });

  it("forwards the sheet choice and the review answer", async () => {
    const worker = new FakeWorker();
    const h = {
      onProgress: vi.fn(),
      chooseSheet: vi.fn(async () => ({ kind: "append" as const })),
      review: vi.fn(async () => ({ exclude: true })),
    };
    importFile(fakeFile("a.xlsx", 10), h, () => worker);
    worker.emit({ type: "sheets", sheets: [], canAppend: true });
    worker.emit({
      type: "review",
      review: { fileName: "a", rowCount: 1, columnCount: 1, issues: { rowCount: 1, issueCount: 1, fileIssues: [], listed: [], excluded: false, sourceRowCount: 1 } },
    });
    await new Promise(r => setTimeout(r, 0));
    expect(worker.sent.slice(1)).toEqual([{ type: "sheet", choice: { kind: "append" } }, { type: "review", exclude: true }]);
  });
});
