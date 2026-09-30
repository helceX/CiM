import { describe, expect, it } from "vitest";
import { generateRawToken, hashToken } from "./tokens";

describe("tokens", () => {
  it("generates URL-safe, sufficiently long random tokens", () => {
    const token = generateRawToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates distinct tokens on each call", () => {
    expect(generateRawToken()).not.toEqual(generateRawToken());
  });

  it("hashes deterministically so a stored hash can be matched on verification", () => {
    const token = generateRawToken();
    expect(hashToken(token)).toEqual(hashToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashToken("a")).not.toEqual(hashToken("b"));
  });
});
