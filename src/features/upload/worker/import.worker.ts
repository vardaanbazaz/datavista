import { runImport, type ImportIO, type SheetChoice } from "../lib/importCore";
import type { FromWorker, ToWorker } from "../lib/importProtocol";

/**
 * Runs the import pipeline (lib/importCore.ts) off the main thread. One worker per import:
 * the main thread terminates it when the import ends or is cancelled, which frees
 * everything it parsed.
 */

const post = (msg: FromWorker) => self.postMessage(msg);

let answerSheet: ((choice: SheetChoice) => void) | null = null;
let answerReview: ((answer: { exclude: boolean }) => void) | null = null;

const io: ImportIO = {
  progress: (stage, fraction) => post({ type: "progress", stage, fraction }),
  chooseSheet: (sheets, canAppend) =>
    new Promise(resolve => {
      answerSheet = resolve;
      post({ type: "sheets", sheets, canAppend });
    }),
  review: review =>
    new Promise(resolve => {
      answerReview = resolve;
      post({ type: "review", review });
    }),
};

self.addEventListener("message", (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === "sheet") {
    answerSheet?.(msg.choice);
    answerSheet = null;
  } else if (msg.type === "review") {
    answerReview?.({ exclude: msg.exclude });
    answerReview = null;
  } else if (msg.type === "start") {
    runImport(msg.file, msg.file.name, msg.options, io).then(
      dataset => post({ type: "done", dataset, sentAt: performance.timeOrigin + performance.now() }),
      (err: unknown) => post({ type: "error", message: err instanceof Error ? err.message : String(err) })
    );
  }
});
