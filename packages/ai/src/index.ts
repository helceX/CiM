import { AnthropicAIProvider } from "./anthropic-provider";
import { MockAIProvider } from "./mock-provider";
import type { AIProvider } from "./provider";

export type { AIProvider } from "./provider";
export { MockAIProvider } from "./mock-provider";
export { AnthropicAIProvider, AIProviderValidationError } from "./anthropic-provider";
export type { AnthropicMessagesClient } from "./anthropic-provider";
export * from "./types";

/**
 * ADR-003 — provider selection is a configuration concern: `AI_PROVIDER`
 * picks the implementation, everything downstream codes only against
 * `AIProvider`. `null` means enrichment is off — the worker leaves
 * `ai_status: pending` and the UI shows "Not available" (brief §92); it is
 * never a crash. `disabled` is the schema default (packages/config); local
 * dev/demo environments set `AI_PROVIDER=mock` to see enrichment end to
 * end without any API key, or `AI_PROVIDER=anthropic` + `AI_API_KEY` for a
 * real model.
 */
export function getAIProvider(env: {
  AI_PROVIDER: "disabled" | "mock" | "anthropic" | "openai";
  AI_API_KEY?: string;
  AI_CHEAP_MODEL: string;
  AI_SYNTHESIS_MODEL: string;
}): AIProvider | null {
  switch (env.AI_PROVIDER) {
    case "mock":
      return new MockAIProvider();
    case "anthropic":
      if (!env.AI_API_KEY) {
        throw new Error("AI_PROVIDER=anthropic requires AI_API_KEY to be set");
      }
      return new AnthropicAIProvider({
        apiKey: env.AI_API_KEY,
        cheapModel: env.AI_CHEAP_MODEL,
        synthesisModel: env.AI_SYNTHESIS_MODEL,
      });
    case "openai":
    case "disabled":
      return null;
  }
}
