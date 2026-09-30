import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale as generate-digest.test.ts. Proves one rule's failure — the
 * stats lookup itself, not just fireAlert — doesn't stop the tick from
 * evaluating every rule ordered after it. Regression: the try/catch here
 * used to wrap only fireAlert, so a getCompetitorAlertStats failure for
 * one rule threw out of the whole loop, silently skipping every other
 * organization's rule still left in that tick.
 */
const getActiveCompetitorAlertRules = vi.fn();
const getCompetitorAlertStats = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  getActiveCompetitorAlertRules: (...args: unknown[]) => getActiveCompetitorAlertRules(...args),
  getCompetitorAlertStats: (...args: unknown[]) => getCompetitorAlertStats(...args),
}));

const fireAlert = vi.fn();
vi.mock("./notify", () => ({
  fireAlert: (...args: unknown[]) => fireAlert(...args),
}));

const { evaluateCompetitorAlerts } = await import("./evaluate-competitor");

function fakeRule(id: string) {
  return { id, name: `Rule ${id}`, projectId: "project-1", queryId: `query-${id}` };
}

describe("evaluateCompetitorAlerts — per-rule failure isolation", () => {
  it("still evaluates rule 2 when rule 1's stats lookup throws", async () => {
    const rule1 = fakeRule("1");
    const rule2 = fakeRule("2");
    getActiveCompetitorAlertRules.mockResolvedValueOnce([rule1, rule2]);
    getCompetitorAlertStats.mockRejectedValueOnce(new Error("transient DB error"));
    getCompetitorAlertStats.mockResolvedValueOnce({
      competitorQueryName: "Competitor Co",
      competitorCount: 10,
      companyCount: 2,
    });
    fireAlert.mockResolvedValueOnce(true);

    const emailQueue = {} as Queue<SendEmailJobData>;
    await evaluateCompetitorAlerts(emailQueue);

    expect(getCompetitorAlertStats).toHaveBeenCalledTimes(2);
    expect(fireAlert).toHaveBeenCalledTimes(1);
    expect(fireAlert).toHaveBeenCalledWith(emailQueue, rule2, expect.anything());
  });
});
