import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale/shape as evaluate-emerging-topics.test.ts. Proves one rule's
 * failure — the stats lookup itself, not just fireAlert — doesn't stop
 * the tick from evaluating every rule ordered after it.
 */
const getActiveCreatorSpikeAlertRules = vi.fn();
const getCreatorSpikeStats = vi.fn();

const getQueryIdsWithCreatorPosts = vi.fn();
const listRuleIdsInCooldown = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  getActiveCreatorSpikeAlertRules: (...args: unknown[]) =>
    getActiveCreatorSpikeAlertRules(...args),
  getCreatorSpikeStats: (...args: unknown[]) => getCreatorSpikeStats(...args),
  getQueryIdsWithCreatorPosts: (...args: unknown[]) => getQueryIdsWithCreatorPosts(...args),
  listRuleIdsInCooldown: (...args: unknown[]) => listRuleIdsInCooldown(...args),
}));

const fireAlert = vi.fn();
vi.mock("./notify", () => ({
  fireAlert: (...args: unknown[]) => fireAlert(...args),
}));

const { evaluateCreatorSpikeAlerts } = await import("./evaluate-creator-spike");

function fakeRule(id: string) {
  return { id, name: `Rule ${id}`, queryId: `query-${id}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  listRuleIdsInCooldown.mockResolvedValue(new Set());
  getQueryIdsWithCreatorPosts.mockImplementation(async (_db: unknown, ids: string[]) => new Set(ids));
});

describe("evaluateCreatorSpikeAlerts — per-rule failure isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still evaluates rule 2 when rule 1's stats lookup throws", async () => {
    const rule1 = fakeRule("1");
    const rule2 = fakeRule("2");
    getActiveCreatorSpikeAlertRules.mockResolvedValueOnce([rule1, rule2]);
    getCreatorSpikeStats.mockRejectedValueOnce(new Error("transient DB error"));
    getCreatorSpikeStats.mockResolvedValueOnce([
      { profileId: "p1", handle: "@creator", currentCount: 10, baselineAvgPerDay: 1 },
    ]);
    fireAlert.mockResolvedValueOnce(true);

    const emailQueue = {} as Queue<SendEmailJobData>;
    await evaluateCreatorSpikeAlerts(emailQueue);

    expect(getCreatorSpikeStats).toHaveBeenCalledTimes(2);
    expect(fireAlert).toHaveBeenCalledTimes(1);
    expect(fireAlert).toHaveBeenCalledWith(emailQueue, rule2, expect.anything());
  });

  it("does not fire when the top creator is below the absolute-count floor", async () => {
    const rule = fakeRule("1");
    getActiveCreatorSpikeAlertRules.mockResolvedValueOnce([rule]);
    getCreatorSpikeStats.mockResolvedValueOnce([
      { profileId: "p1", handle: "@quiet", currentCount: 2, baselineAvgPerDay: 0 },
    ]);

    const emailQueue = {} as Queue<SendEmailJobData>;
    await evaluateCreatorSpikeAlerts(emailQueue);

    expect(fireAlert).not.toHaveBeenCalled();
  });
});
