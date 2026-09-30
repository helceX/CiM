import { describe, expect, it } from "vitest";
import { AnthropicAIProvider, getAIProvider, MockAIProvider } from "./index";

describe("getAIProvider", () => {
  const base = { AI_PROVIDER: "disabled" as const, AI_CHEAP_MODEL: "m1", AI_SYNTHESIS_MODEL: "m2" };

  it("returns null when AI is disabled — enrichment stays off, never a crash", () => {
    expect(getAIProvider(base)).toBeNull();
  });

  it("returns null for the reserved, not-yet-implemented openai option", () => {
    expect(getAIProvider({ ...base, AI_PROVIDER: "openai" })).toBeNull();
  });

  it("returns the mock provider without requiring an API key", () => {
    const provider = getAIProvider({ ...base, AI_PROVIDER: "mock" });
    expect(provider).toBeInstanceOf(MockAIProvider);
  });

  it("returns the Anthropic provider when a key is configured", () => {
    const provider = getAIProvider({ ...base, AI_PROVIDER: "anthropic", AI_API_KEY: "sk-test" });
    expect(provider).toBeInstanceOf(AnthropicAIProvider);
  });

  it("refuses to silently fall back when anthropic is selected without a key", () => {
    expect(() => getAIProvider({ ...base, AI_PROVIDER: "anthropic" })).toThrow(/AI_API_KEY/);
  });
});
