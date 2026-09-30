import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale as enforce-retention.test.ts. Proves one org's failure
 * doesn't stop every org ordered after it from getting a usage snapshot.
 */
const listActiveOrganizationsForUsageCapture = vi.fn();
const captureFeatureUsageSnapshot = vi.fn();
const meterKeywordDay = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  listActiveOrganizationsForUsageCapture: (...args: unknown[]) =>
    listActiveOrganizationsForUsageCapture(...args),
  captureFeatureUsageSnapshot: (...args: unknown[]) => captureFeatureUsageSnapshot(...args),
  meterKeywordDay: (...args: unknown[]) => meterKeywordDay(...args),
}));

const { processCaptureFeatureUsageJob } = await import("./capture-feature-usage");

beforeEach(() => vi.clearAllMocks());

describe("processCaptureFeatureUsageJob — per-org failure isolation", () => {
  it("still captures usage for org 2 when org 1's snapshot throws", async () => {
    listActiveOrganizationsForUsageCapture.mockResolvedValueOnce([
      { organizationId: "org-1" },
      { organizationId: "org-2" },
    ]);
    captureFeatureUsageSnapshot.mockRejectedValueOnce(new Error("transient DB error"));
    captureFeatureUsageSnapshot.mockResolvedValueOnce(undefined);

    await processCaptureFeatureUsageJob();

    expect(captureFeatureUsageSnapshot).toHaveBeenCalledTimes(2);
    expect(captureFeatureUsageSnapshot).toHaveBeenNthCalledWith(2, expect.anything(), "org-2");
  });

  it("meters keywords for today's UTC date even when the snapshot throws", async () => {
    listActiveOrganizationsForUsageCapture.mockResolvedValueOnce([{ organizationId: "org-1" }]);
    captureFeatureUsageSnapshot.mockRejectedValueOnce(new Error("snapshot failed"));
    meterKeywordDay.mockResolvedValueOnce({ keywords: 2, charged: true });

    await processCaptureFeatureUsageJob(new Date("2026-09-30T23:59:59Z"));

    expect(meterKeywordDay).toHaveBeenCalledWith(expect.anything(), "org-1", "2026-09-30");
  });

  it("still handles org 2 when org 1's metering throws", async () => {
    listActiveOrganizationsForUsageCapture.mockResolvedValueOnce([
      { organizationId: "org-1" },
      { organizationId: "org-2" },
    ]);
    captureFeatureUsageSnapshot.mockResolvedValue(undefined);
    meterKeywordDay.mockRejectedValueOnce(new Error("ledger down"));
    meterKeywordDay.mockResolvedValueOnce({ keywords: 1, charged: true });

    await processCaptureFeatureUsageJob(new Date("2026-10-01T00:00:00Z"));

    expect(meterKeywordDay).toHaveBeenCalledTimes(2);
    expect(meterKeywordDay).toHaveBeenNthCalledWith(2, expect.anything(), "org-2", "2026-10-01");
  });
});
