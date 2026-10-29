// Runs tests/bigfiles once per file in test-data-local/, one at a time, each with its own
// dev server and browser (playwright.bigfiles.config.ts). Files that aren't there are
// skipped. Usage: npm run test:bigfiles [-- file.csv ...]
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { freemem } from "node:os";

const ALL = ["online_retail_II.csv", "online_retail_II.xlsx", "creditcard.csv", "googleplaystore.csv"];
const requested = process.argv.slice(2);
const files = (requested.length > 0 ? requested : ALL).filter(f => {
  const ok = existsSync(`test-data-local/${f}`);
  if (!ok) console.log(`skip ${f}: test-data-local/${f} not found`);
  return ok;
});
if (files.length === 0) {
  console.log("No big files found in test-data-local/; nothing to run.");
  process.exit(0);
}

let failed = 0;
for (const file of files) {
  console.log(`\n=== ${file} (free memory ${(freemem() / 1e9).toFixed(1)} GB) ===`);
  const run = spawnSync("npx", ["playwright", "test", "--config", "playwright.bigfiles.config.ts"], {
    stdio: "inherit",
    env: { ...process.env, BIGFILE: file },
  });
  if (run.status !== 0) {
    failed++;
    console.log(`${file}: FAILED (exit ${run.status ?? run.signal})`);
  }
}
console.log(`\nResults: test-results/bigfiles/*.json`);
process.exit(failed > 0 ? 1 : 0);
