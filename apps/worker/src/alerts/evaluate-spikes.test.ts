import { beforeEach, describe, expect, it, vi } from "vitest";
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
const getQueryIdsWithCurrentHourMentions = vi.fn();
const listRuleIdsInCooldown = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  getActiveSpikeAlertRules: (...args: unknown[]) => getActiveSpikeAlertRules(...args),
  getQuerySpikeStats: (...args: unknown[]) => getQuerySpikeStats(...args),
  getQueryIdsWithCurrentHourMentions: (...args: unknown[]) => getQueryIdsWithCurrentHourMentions(...args),
  listRuleIdsInCooldown: (...args: unknown[]) => listRuleIdsInCooldown(...args),
}));

const fireAlert = vi.fn();
vi.mock("./notify", () => ({
  fireAlert: (...args: unknown[]) => fireAlert(...args),
}));

const { evaluateSpikeAlerts } = await import("./evaluate-spikes");

function fakeRule(id: string) {
  return { id, name: `Rule ${id}`, queryId: `query-${id}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  listRuleIdsInCooldown.mockResolvedValue(new Set());
  getQueryIdsWithCurrentHourMentions.mockImplementation(async (_db: unknown, ids: string[]) => new Set(ids));
});

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

  it("computes no statistics for a rule that is cooling down or whose query is below the volume floor", async () => {
    const cooling = fakeRule("cooling");
    const quiet = fakeRule("quiet");
    const busy = fakeRule("busy");
    getActiveSpikeAlertRules.mockResolvedValueOnce([cooling, quiet, busy]);
    listRuleIdsInCooldown.mockResolvedValueOnce(new Set([cooling.id]));
    getQueryIdsWithCurrentHourMentions.mockResolvedValueOnce(new Set([busy.queryId]));
    getQuerySpikeStats.mockResolvedValueOnce({ currentHourCount: 100, baselineAvg: 1, baselineStdDev: 0.5 });
    fireAlert.mockResolvedValueOnce(true);

    const emailQueue = {} as Queue<SendEmailJobData>;
    await evaluateSpikeAlerts(emailQueue);

    expect(getQueryIdsWithCurrentHourMentions).toHaveBeenCalledWith(expect.anything(), [quiet.queryId, busy.queryId], 3);
    expect(getQuerySpikeStats).toHaveBeenCalledTimes(1);
    expect(getQuerySpikeStats).toHaveBeenCalledWith(expect.anything(), busy.queryId);
    expect(fireAlert).toHaveBeenCalledWith(emailQueue, busy, expect.anything());
  });

  it("falls back to evaluating every rule when the pre-filter itself fails — an optimisation must not hide an alert", async () => {
    const rule1 = fakeRule("1");
    const rule2 = fakeRule("2");
    getActiveSpikeAlertRules.mockResolvedValueOnce([rule1, rule2]);
    listRuleIdsInCooldown.mockRejectedValueOnce(new Error("transient DB error"));
    getQuerySpikeStats.mockResolvedValue({ currentHourCount: 0, baselineAvg: 0, baselineStdDev: 0 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await evaluateSpikeAlerts({} as Queue<SendEmailJobData>);

    expect(getQuerySpikeStats).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
