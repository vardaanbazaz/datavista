#!/usr/bin/env node
/**
 * Browser-access (CORS) check for the hosted AI providers in
 * src/features/ai/providers/registry.json. Sends NO API keys.
 *
 * For each hosted provider it sends, to the exact chat endpoint the app calls:
 *   (a) a CORS preflight (OPTIONS) with Origin = the deployed site and the request headers
 *       the app would send, and
 *   (b) an unauthenticated POST with that Origin.
 * A provider is "ok" only when the preflight allows the origin, POST and every requested
 * header (a "*" in Allow-Headers does not cover Authorization, per the Fetch spec), AND the
 * POST response (normally a 401) also carries Access-Control-Allow-Origin. Otherwise
 * "needs a proxy". Network failures leave the entry "unchecked".
 *
 * Usage: node scripts/ai/check-browser-access.mjs [--dry-run]
 * Writes browserAccess { status, checkedAt, detail } back into registry.json.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const registryPath = path.resolve(here, "../../src/features/ai/providers/registry.json");
const dryRun = process.argv.includes("--dry-run");

const registry = JSON.parse(await readFile(registryPath, "utf8"));
const origin = registry.checkedOrigin;

/** The endpoint and headers the app's client (src/features/ai/client) sends per API style. */
function requestShape(provider) {
  const model = provider.suggestedModels[0] ?? "test";
  switch (provider.apiStyle) {
    case "anthropic":
      return {
        url: `${provider.baseUrl}/messages`,
        headers: ["content-type", "x-api-key", "anthropic-version", "anthropic-dangerous-direct-browser-access"],
        sendHeaders: { "content-type": "application/json", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: { model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] },
      };
    case "gemini":
      return {
        url: `${provider.baseUrl}/models/${model}:streamGenerateContent?alt=sse`,
        headers: ["content-type", "x-goog-api-key"],
        sendHeaders: { "content-type": "application/json" },
        body: { contents: [{ role: "user", parts: [{ text: "hi" }] }] },
      };
    default:
      return {
        url: `${provider.baseUrl}/chat/completions`,
        headers: ["authorization", "content-type"],
        sendHeaders: { "content-type": "application/json" },
        body: { model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
      };
  }
}

const lower = (v) => (v ?? "").toLowerCase();
const originAllowed = (acao) => acao === "*" || acao === origin;

async function check(provider) {
  const shape = requestShape(provider);
  const result = { id: provider.id, url: shape.url };
  try {
    const pre = await fetch(shape.url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": shape.headers.join(","),
      },
      signal: AbortSignal.timeout(15000),
    });
    const acao = pre.headers.get("access-control-allow-origin");
    const allowHeaders = lower(pre.headers.get("access-control-allow-headers"))
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allowMethods = lower(pre.headers.get("access-control-allow-methods"));
    const missingHeaders = shape.headers.filter((h) => {
      if (allowHeaders.includes(h)) return false;
      // "*" covers everything except Authorization (and only for non-credentialed requests).
      return !(allowHeaders.includes("*") && h !== "authorization");
    });
    const methodOk = allowMethods === "" ? false : allowMethods.includes("post") || allowMethods.includes("*");
    result.preflight = { status: pre.status, acao, allowHeaders: allowHeaders.join(","), allowMethods, missingHeaders };

    const post = await fetch(shape.url, {
      method: "POST",
      headers: { Origin: origin, ...shape.sendHeaders },
      body: JSON.stringify(shape.body),
      signal: AbortSignal.timeout(15000),
    });
    result.post = { status: post.status, acao: post.headers.get("access-control-allow-origin") };
    await post.body?.cancel();

    const ok = originAllowed(acao) && methodOk && missingHeaders.length === 0 && originAllowed(result.post.acao);
    result.status = ok ? "ok" : "needs-proxy";
    const reasons = [];
    if (!originAllowed(acao)) reasons.push("preflight does not allow the origin");
    if (!methodOk) reasons.push("preflight does not allow POST");
    if (missingHeaders.length) reasons.push(`preflight does not allow ${missingHeaders.join(", ")}`);
    if (!originAllowed(result.post.acao)) reasons.push(`POST (${post.status}) has no Access-Control-Allow-Origin`);
    result.detail = ok ? `preflight ${pre.status}, POST ${post.status} with Access-Control-Allow-Origin` : reasons.join("; ");
  } catch (e) {
    result.status = "unchecked";
    result.detail = `request failed: ${e?.cause?.code ?? e?.name ?? "error"}`;
  }
  return result;
}

const today = new Date().toISOString().slice(0, 10);
const hosted = registry.providers.filter((p) => p.keyRequired && p.baseUrl.startsWith("https://"));
const results = [];
for (const p of hosted) results.push(await check(p));

for (const r of results) {
  console.log(`${r.id.padEnd(11)} ${r.status.padEnd(12)} ${r.detail}`);
  if (process.env.VERBOSE) console.log("            ", JSON.stringify({ preflight: r.preflight, post: r.post }));
}

if (!dryRun) {
  for (const r of results) {
    const entry = registry.providers.find((p) => p.id === r.id);
    if (r.status === "unchecked") {
      entry.browserAccess = { status: "unchecked", checkedAt: null, detail: r.detail };
    } else {
      entry.browserAccess = { status: r.status, checkedAt: today, detail: r.detail };
    }
  }
  await writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n");
  console.log(`\nWrote ${path.relative(process.cwd(), registryPath)}`);
}
