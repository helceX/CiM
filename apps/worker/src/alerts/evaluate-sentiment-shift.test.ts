import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale as generate-digest.test.ts. Proves one rule's failure — the
 * stats lookup itself, not just fireAlert — doesn't stop the tick from
 * evaluating every rule ordered after it. Regression: the try/catch here
 * used to wrap only fireAlert, so a getQuerySentimentShiftStats failure
 * for one rule threw out of the whole loop, silently skipping every
 * other organization's rule still left in that tick.
 */
const getActiveSentimentShiftAlertRules = vi.fn();
const getQuerySentimentShiftStats = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  getActiveSentimentShiftAlertRules: (...args: unknown[]) => getActiveSentimentShiftAlertRules(...args),
  getQuerySentimentShiftStats: (...args: unknown[]) => getQuerySentimentShiftStats(...args),
}));

const fireAlert = vi.fn();
vi.mock("./notify", () => ({
  fireAlert: (...args: unknown[]) => fireAlert(...args),
}));

const { evaluateSentimentShiftAlerts } = await import("./evaluate-sentiment-shift");

function fakeRule(id: string) {
  return { id, name: `Rule ${id}`, queryId: `query-${id}` };
}

describe("evaluateSentimentShiftAlerts — per-rule failure isolation", () => {
  it("still evaluates rule 2 when rule 1's stats lookup throws", async () => {
    const rule1 = fakeRule("1");
    const rule2 = fakeRule("2");
    getActiveSentimentShiftAlertRules.mockResolvedValueOnce([rule1, rule2]);
    getQuerySentimentShiftStats.mockRejectedValueOnce(new Error("transient DB error"));
    getQuerySentimentShiftStats.mockResolvedValueOnce({
      currentClassifiedCount: 10,
      currentNegativeShare: 0.8,
      baselineClassifiedCount: 10,
      baselineNegativeShare: 0.1,
    });
    fireAlert.mockResolvedValueOnce(true);

    const emailQueue = {} as Queue<SendEmailJobData>;
    await evaluateSentimentShiftAlerts(emailQueue);

    expect(getQuerySentimentShiftStats).toHaveBeenCalledTimes(2);
    expect(fireAlert).toHaveBeenCalledTimes(1);
    expect(fireAlert).toHaveBeenCalledWith(emailQueue, rule2, expect.anything());
  });
});
