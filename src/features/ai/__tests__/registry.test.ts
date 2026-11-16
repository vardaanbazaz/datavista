import { describe, it, expect } from "vitest";
import { PROVIDERS, getProvider, defaultModel, browserAccessText, isProviderId } from "../providers/registry";

const REQUIRED = ["openai", "anthropic", "gemini", "openrouter", "groq", "mistral", "deepseek", "together", "ollama", "lmstudio", "custom"];

describe("provider registry", () => {
  it("lists every required provider once", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(REQUIRED));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry is complete", () => {
    for (const p of PROVIDERS) {
      expect(p.label, p.id).toBeTruthy();
      expect(["openai-compatible", "anthropic", "gemini"], p.id).toContain(p.apiStyle);
      expect(typeof p.keyRequired, p.id).toBe("boolean");
      expect(Array.isArray(p.suggestedModels), p.id).toBe(true);
      expect(["ok", "needs-proxy", "local", "unchecked"], p.id).toContain(p.browserAccess.status);
      expect(p.setupNote.length, p.id).toBeGreaterThan(10);
      if (p.id !== "custom") expect(p.baseUrl, p.id).toMatch(/^https?:\/\//);
      if (p.browserAccess.status === "ok" || p.browserAccess.status === "needs-proxy") {
        expect(p.browserAccess.checkedAt, p.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("local servers need no key and use the documented ports, with origin notes", () => {
    expect(getProvider("ollama")).toMatchObject({ keyRequired: false, baseUrl: "http://localhost:11434/v1" });
    expect(getProvider("lmstudio")).toMatchObject({ keyRequired: false, baseUrl: "http://localhost:1234/v1" });
    expect(getProvider("ollama").setupNote).toContain("OLLAMA_ORIGINS");
    expect(getProvider("lmstudio").setupNote).toMatch(/CORS/);
  });

  it("hosted providers need a key; Custom has no base URL of its own", () => {
    for (const id of ["openai", "anthropic", "gemini", "openrouter", "groq", "mistral", "deepseek", "together"]) expect(getProvider(id).keyRequired).toBe(true);
    expect(getProvider("custom").baseUrl).toBe("");
  });

  it("falls back to the default provider for an unknown id", () => {
    expect(getProvider("nope").id).toBe("gemini");
    expect(isProviderId("nope")).toBe(false);
    expect(isProviderId("groq")).toBe(true);
  });

  it("keeps the models the app used before (continuity for migrated keys)", () => {
    expect(defaultModel(getProvider("gemini"))).toBe("gemini-flash-latest");
    expect(defaultModel(getProvider("openai"))).toBe("gpt-4o-mini");
  });

  it("describes a needs-proxy status with a warning", () => {
    const p = { ...getProvider("openai"), browserAccess: { status: "needs-proxy" as const, checkedAt: "2026-11-16" } };
    expect(browserAccessText(p)).toMatch(/needs a proxy/);
  });
});
