import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password against its own hash", async () => {
    const hash = await hashPassword("Sup3rSecret!");
    await expect(verifyPassword("Sup3rSecret!", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Sup3rSecret!");
    await expect(verifyPassword("WrongPassword1", hash)).resolves.toBe(false);
  });

  it("produces a different hash (different salt) for the same password", async () => {
    const first = await hashPassword("Sup3rSecret!");
    const second = await hashPassword("Sup3rSecret!");
    expect(first).not.toEqual(second);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    await expect(verifyPassword("anything", "not-a-real-hash")).resolves.toBe(false);
  });

  it("handles Turkish characters correctly via NFKC normalization", async () => {
    const hash = await hashPassword("İstanbul123!şğüöç");
    await expect(verifyPassword("İstanbul123!şğüöç", hash)).resolves.toBe(true);
  });
});
