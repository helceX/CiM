import { describe, expect, it } from "vitest";
import {
  classifyFeedFailure,
  describeTally,
  importRetryEligible,
  isTransientFeedFailure,
  looksLikeLocalFault,
  spreadByHost,
  tallyFailures,
} from "./feed-failure";

describe("classifyFeedFailure — the messages the import records", () => {
  it.each([
    ["The server answered HTTP 403.", "blocked"],
    ["The server answered HTTP 401.", "blocked"],
    ["The server answered HTTP 404.", "not_found"],
    ["The server answered HTTP 410.", "not_found"],
    ["The server answered HTTP 429.", "rate_limited"],
    ["The server answered HTTP 503.", "server_error"],
    ["The server answered HTTP 408.", "timeout"],
    ["The server answered HTTP 418.", "other"],
    ["The feed has no items.", "empty"],
    ["Could not read it: Unrecognized feed format: expected RSS <rss><channel> or Atom <feed>", "not_a_feed"],
    ["No readable feed was found.", "not_a_feed"],
    ["robots.txt asks bots to stay away.", "policy"],
    ["That address is not allowed.", "policy"],
    ["Could not read it: The operation was aborted due to timeout", "timeout"],
    ["Could not read it: This operation was aborted", "timeout"],
    ["Could not read it: fetch failed", "network"],
    ["Could not read it: getaddrinfo ENOTFOUND feed.example", "network"],
    ["Could not read it: unable to verify the first certificate", "network"],
    ["Something nobody has seen", "other"],
    [null, "other"],
  ])("%s → %s", (message, expected) => {
    expect(classifyFeedFailure(message)).toBe(expected);
  });

  it("calls only the failures of the moment transient", () => {
    for (const failure of ["timeout", "network", "rate_limited", "server_error"] as const) expect(isTransientFeedFailure(failure)).toBe(true);
    for (const failure of ["blocked", "not_found", "not_a_feed", "empty", "policy", "other"] as const) expect(isTransientFeedFailure(failure)).toBe(false);
  });
});

describe("importRetryEligible", () => {
  const day = 86_400_000;
  const now = new Date("2026-10-09T12:00:00Z");
  const failed = (error: string, attempts: number, ageDays: number) => ({
    status: "failed",
    attempts,
    attemptedAt: new Date(now.getTime() - ageDays * day),
    error,
  });

  it("keeps the old rule for a feed that is gone or refused: twice, three days apart", () => {
    expect(importRetryEligible(failed("The server answered HTTP 404.", 1, 2), now)).toBe(false);
    expect(importRetryEligible(failed("The server answered HTTP 404.", 1, 3.1), now)).toBe(true);
    expect(importRetryEligible(failed("The server answered HTTP 403.", 2, 30), now)).toBe(false);
  });

  it("gives a failure of the moment a day, and five tries", () => {
    expect(importRetryEligible(failed("Could not read it: The operation was aborted due to timeout", 1, 0.5), now)).toBe(false);
    expect(importRetryEligible(failed("Could not read it: The operation was aborted due to timeout", 1, 1.1), now)).toBe(true);
    expect(importRetryEligible(failed("The server answered HTTP 429.", 4, 2), now)).toBe(true);
    expect(importRetryEligible(failed("The server answered HTTP 429.", 5, 20), now)).toBe(false);
  });

  it("never asks again about an added or skipped feed", () => {
    expect(importRetryEligible({ status: "added", attempts: 1, attemptedAt: new Date(0), error: null }, now)).toBe(false);
    expect(importRetryEligible({ status: "skipped", attempts: 1, attemptedAt: new Date(0), error: "blocked" }, now)).toBe(false);
  });
});

describe("spreadByHost", () => {
  it("takes at most N feeds of one publisher per batch, in catalog order, and keeps looking further down", () => {
    const list = [
      ...Array.from({ length: 5 }, (_, i) => ({ url: `https://big.example/feed${i}` })),
      { url: "https://a.example/rss" },
      { url: "https://b.example/rss" },
    ];
    expect(spreadByHost(list, 4, 2).map((c) => c.url)).toEqual([
      "https://big.example/feed0",
      "https://big.example/feed1",
      "https://a.example/rss",
      "https://b.example/rss",
    ]);
  });
});

describe("looksLikeLocalFault", () => {
  const failures = (count: number, message: string, hosts = count) =>
    Array.from({ length: count }, (_, i) => ({ url: `https://h${i % hosts}.example/f${i}`, message }));

  it("blames us when a big batch across many publishers all timed out", () => {
    const tally = tallyFailures(failures(25, "Could not read it: The operation was aborted due to timeout"));
    expect(looksLikeLocalFault(tally, 0)).toBe(true);
    expect(describeTally(tally)).toBe("timeout 25");
  });

  it("does not blame us for dead feeds, one publisher, a small batch, or a batch that also added feeds", () => {
    expect(looksLikeLocalFault(tallyFailures(failures(25, "The server answered HTTP 404.")), 0)).toBe(false);
    expect(looksLikeLocalFault(tallyFailures(failures(25, "The server answered HTTP 429.", 2)), 0)).toBe(false);
    expect(looksLikeLocalFault(tallyFailures(failures(5, "fetch failed")), 0)).toBe(false);
    expect(looksLikeLocalFault(tallyFailures(failures(25, "fetch failed")), 3)).toBe(false);
  });
});
