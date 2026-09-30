import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale as generate-digest.test.ts. Proves one rule's failure — the
 * stats lookup itself, not just fireAlert — doesn't stop the tick from
 * evaluating every rule ordered after it. Regression: the try/catch here
 * used to wrap only fireAlert, so a getQuerySpikeStats failure for one
 * rule threw out of the whole loop, silently skipping every other
 * organization's rule still left in that tick.
 */
const getActiveSpikeAlertRules = vi.fn();
const getQuerySpikeStats = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  getActiveSpikeAlertRules: (...args: unknown[]) => getActiveSpikeAlertRules(...args),
  getQuerySpikeStats: (...args: unknown[]) => getQuerySpikeStats(...args),
}));

const fireAlert = vi.fn();
vi.mock("./notify", () => ({
  fireAlert: (...args: unknown[]) => fireAlert(...args),
}));

const { evaluateSpikeAlerts } = await import("./evaluate-spikes");

function fakeRule(id: string) {
  return { id, name: `Rule ${id}`, queryId: `query-${id}` };
}

describe("evaluateSpikeAlerts — per-rule failure isolation", () => {
  it("still evaluates rule 2 when rule 1's stats lookup throws", async () => {
    const rule1 = fakeRule("1");
    const rule2 = fakeRule("2");
    getActiveSpikeAlertRules.mockResolvedValueOnce([rule1, rule2]);
    getQuerySpikeStats.mockRejectedValueOnce(new Error("transient DB error"));
    getQuerySpikeStats.mockResolvedValueOnce({
      currentHourCount: 100,
      baselineAvg: 1,
      baselineStdDev: 0.5,
    });
    fireAlert.mockResolvedValueOnce(true);

    const emailQueue = {} as Queue<SendEmailJobData>;
    await evaluateSpikeAlerts(emailQueue);

    expect(getQuerySpikeStats).toHaveBeenCalledTimes(2);
    expect(fireAlert).toHaveBeenCalledTimes(1);
    expect(fireAlert).toHaveBeenCalledWith(emailQueue, rule2, expect.anything());
  });
});
