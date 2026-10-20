import { describe, expect, it } from "vitest";
import {
  parseCrawlDiagnostic,
  parseStorageSnapshot,
  storageHistoryDays,
} from "./operational-history";

describe("operational history validation", () => {
  const failure = {
    failures: 2,
    nextAt: 1_800_000_000_000,
    failure: {
      category: "rate_limited",
      checkedAt: 1_799_000_000_000,
      stage: "health",
    },
  };
  it("reads only safe diagnostic fields and leaves legacy state unknown", () => {
    expect(
      parseCrawlDiagnostic(
        JSON.stringify({ ...failure, token: "private", seen: ["private"] }),
      ),
    ).toEqual({ ...failure.failure, failures: 2, nextAt: failure.nextAt });
    expect(
      parseCrawlDiagnostic(JSON.stringify({ failures: 4, nextAt: 1_800_000_000_000 })),
    ).toBeNull();
  });
  it.each([
    null,
    "not json",
    "{}",
    JSON.stringify({ ...failure, failures: -1 }),
    JSON.stringify({ ...failure, nextAt: 1e100 }),
    JSON.stringify({
      ...failure,
      failure: { ...failure.failure, category: "constructor" },
    }),
  ])("does not invent a reason from malformed state %s", (raw) => {
    expect(parseCrawlDiagnostic(raw)).toBeNull();
  });
  it("builds exactly sixty UTC days across year boundaries", () => {
    const days = storageHistoryDays(new Date("2027-01-01T00:01:00Z"));
    expect(days).toHaveLength(60);
    expect(days[0]).toBe("2026-11-03");
    expect(days.at(-1)).toBe("2027-01-01");
    expect(new Set(days).size).toBe(60);
  });
  it("rejects missing, wrong-day and invalid size measurements", () => {
    const sample = { at: "2026-10-20T08:45:00Z", bytes: 1024 };
    expect(parseStorageSnapshot(JSON.stringify(sample), "2026-10-20")).toEqual(sample);
    expect(parseStorageSnapshot(JSON.stringify(sample), "2026-10-19")).toBeNull();
    expect(
      parseStorageSnapshot(JSON.stringify({ ...sample, bytes: -1 }), "2026-10-20"),
    ).toBeNull();
    expect(parseStorageSnapshot(null, "2026-10-20")).toBeNull();
  });
});
