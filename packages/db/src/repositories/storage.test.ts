import { describe, expect, it, vi } from "vitest";
import type { Db } from "../client";
import { getDatabaseSizeBytes } from "./storage";
describe("database size measurement", () => {
  it.each([
    { rows: [] },
    { rows: [{ size: "" }] },
    { rows: [{ size: "bad" }] },
    { rows: [{ size: "-1" }] },
  ])(
    "rejects missing/invalid results instead of fabricating zero: %j",
    async ({ rows }) => {
      const db = { execute: vi.fn().mockResolvedValue({ rows }) } as unknown as Db;
      await expect(getDatabaseSizeBytes(db)).rejects.toThrow("measurement unavailable");
    },
  );
});
