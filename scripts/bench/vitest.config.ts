// Local-only persistence bench (not part of `npm test` or CI):
//   NODE_OPTIONS=--max-old-space-size=8192 npx vitest run --config scripts/bench/vitest.config.ts
// BENCH_ROWS overrides the row count (default 1,000,000). Writes test-results/bench/persistence.json.
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../../src") } },
  test: {
    environment: "node",
    setupFiles: ["fake-indexeddb/auto"],
    include: ["scripts/bench/**/*.bench.ts"],
    root: path.resolve(__dirname, "../.."),
    testTimeout: 30 * 60 * 1000,
    hookTimeout: 30 * 60 * 1000,
    pool: "forks",
  },
});
