import type { Dataset } from "@/shared/types";
import { localeDayFirst } from "@/shared/utils/dates";
import type { ImportReview, ImportStage, SheetChoice, SheetInfo } from "./importCore";
import { checkImportFile } from "./importLimits";
import type { FromWorker, ToWorker } from "./importProtocol";

/**
 * Main-thread side of the import pipeline, shared by every file input (store/importStore.ts).
 * Checks the file (size, format) before anything reads it, then hands the File to a fresh
 * worker and relays its progress and questions. `cancel()` terminates the worker.
 */

export interface ImportHandlers {
  onProgress(stage: ImportStage, fraction: number | null): void;
  /** Resolve null to cancel the import. */
  chooseSheet(sheets: SheetInfo[], canAppend: boolean): Promise<SheetChoice | null>;
  /** Resolve null to cancel the import. */
  review(review: ImportReview): Promise<{ exclude: boolean } | null>;
}

export interface ImportResult {
  dataset: Dataset;
  /** Worker postMessage -> main-thread handler, including structured-clone deserialization. */
  transferMs: number;
}

export interface ImportJob {
  promise: Promise<ImportResult>;
  cancel(): void;
  /** False when the file was rejected before a worker started (the promise rejects with ImportRejected). */
  started: boolean;
  /** Large-file notice, when the file passed the cap but is big. */
  warning?: { title: string; description: string };
}

export class ImportRejected extends Error {
  constructor(readonly title: string, description: string) {
    super(description);
    this.name = "ImportRejected";
  }
}

export class ImportCancelled extends Error {
  constructor() {
    super("Import cancelled");
    this.name = "ImportCancelled";
  }
}

export interface WorkerLike {
  postMessage(msg: ToWorker): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export const createImportWorker = (): WorkerLike =>
  new Worker(new URL("../worker/import.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;

export function importFile(
  file: File,
  handlers: ImportHandlers,
  createWorker: () => WorkerLike = createImportWorker
): ImportJob {
  const check = checkImportFile(file);
  if (check.ok === false) {
    return { promise: Promise.reject(new ImportRejected(check.title, check.description)), cancel: () => {}, started: false };
  }

  let worker: WorkerLike | null = createWorker();
  let settle: { resolve: (r: ImportResult) => void; reject: (e: Error) => void } | null = null;
  const promise = new Promise<ImportResult>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const finish = (outcome: { result: ImportResult } | { error: Error }) => {
    worker?.terminate();
    worker = null;
    const s = settle;
    settle = null;
    if (!s) return;
    if ("result" in outcome) s.resolve(outcome.result);
    else s.reject(outcome.error);
  };
  const cancel = () => finish({ error: new ImportCancelled() });
  const send = (msg: ToWorker) => worker?.postMessage(msg);

  worker.onmessage = event => {
    const msg = event.data;
    switch (msg.type) {
      case "progress":
        handlers.onProgress(msg.stage, msg.fraction);
        break;
      case "sheets":
        handlers.chooseSheet(msg.sheets, msg.canAppend).then(choice => (choice ? send({ type: "sheet", choice }) : cancel()));
        break;
      case "review":
        handlers.review(msg.review).then(answer => (answer ? send({ type: "review", exclude: answer.exclude }) : cancel()));
        break;
      case "done": {
        const transferMs = performance.timeOrigin + performance.now() - msg.sentAt;
        finish({ result: { dataset: msg.dataset, transferMs } });
        break;
      }
      case "error":
        finish({ error: new Error(msg.message) });
        break;
    }
  };
  worker.onerror = event => finish({ error: new Error(event.message || "The import worker failed to start.") });
  worker.postMessage({ type: "start", file, options: { dayFirstDefault: localeDayFirst() } });

  return { promise, cancel, started: true, warning: check.warning };
}
