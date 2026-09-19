import { LlmProvider } from "@/store/uiStore";

/** Human-readable label for an LlmProvider, shared by AiSettingsModal and ExecutiveSummaryPanel. */
export function providerDisplayName(provider: LlmProvider): string {
  return provider === "gemini" ? "Google Gemini" : "OpenAI GPT-4o";
}
