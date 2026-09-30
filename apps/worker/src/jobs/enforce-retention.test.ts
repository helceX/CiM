import { describe, expect, it, vi } from "vitest";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) rather
 * than extending enforce-retention.integration.test.ts — forcing one
 * specific org's deleteExpiredMentions call to fail needs per-call
 * control that a real Postgres fixture can't cheaply produce. This
 * proves the fan-out isolation invariant: one org's failure must not
 * stop every org ordered after it from being processed.
 */
const getOrganizationsWithRetentionPolicy = vi.fn();
const deleteExpiredMentions = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  getOrganizationsWithRetentionPolicy: (...args: unknown[]) => getOrganizationsWithRetentionPolicy(...args),
  deleteExpiredMentions: (...args: unknown[]) => deleteExpiredMentions(...args),
}));

const { processEnforceRetentionJob } = await import("./enforce-retention");

describe("processEnforceRetentionJob — per-org failure isolation", () => {
  it("still enforces retention for org 2 when org 1's delete throws", async () => {
    getOrganizationsWithRetentionPolicy.mockResolvedValueOnce([
      { organizationId: "org-1", mentionRetentionDays: 30 },
      { organizationId: "org-2", mentionRetentionDays: 30 },
    ]);
    deleteExpiredMentions.mockRejectedValueOnce(new Error("transient DB error"));
    deleteExpiredMentions.mockResolvedValueOnce(3);

    await processEnforceRetentionJob();

    expect(deleteExpiredMentions).toHaveBeenCalledTimes(2);
    expect(deleteExpiredMentions).toHaveBeenNthCalledWith(2, expect.anything(), "org-2", 30);
  });
});
