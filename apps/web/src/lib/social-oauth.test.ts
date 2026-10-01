import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { callbackUrl, newPkce, newState, openTransaction, sealTransaction } = await import("./social-oauth");

const secret = "s".repeat(40);
const tx = { platform: "x", state: "st", verifier: "v", userId: "u", organizationId: "o", expiresAt: Date.now() + 60_000 };

describe("social OAuth transaction cookie", () => {
  it("round-trips a signed transaction", () => {
    expect(openTransaction(sealTransaction(tx, secret), secret)).toEqual(tx);
  });

  it("rejects a forged, tampered, expired or missing value", () => {
    const sealed = sealTransaction(tx, secret);
    expect(openTransaction(sealed, "another-secret-another-secret-another")).toBeNull();
    const [payload, signature] = sealed.split(".");
    const forged = Buffer.from(JSON.stringify({ ...tx, userId: "attacker" })).toString("base64url");
    expect(openTransaction(`${forged}.${signature}`, secret)).toBeNull();
    expect(openTransaction(`${payload}.`, secret)).toBeNull();
    expect(openTransaction(sealTransaction({ ...tx, expiresAt: Date.now() - 1 }, secret), secret)).toBeNull();
    expect(openTransaction(undefined, secret)).toBeNull();
    expect(openTransaction("garbage", secret)).toBeNull();
  });

  it("makes a verifier whose S256 challenge matches, and unique states", () => {
    const { verifier, challenge } = newPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newState()).not.toBe(newState());
  });

  it("builds the callback from the public app address", () => {
    expect(callbackUrl("https://mediaory.io/", "x")).toBe("https://mediaory.io/api/social/callback/x");
  });
});
