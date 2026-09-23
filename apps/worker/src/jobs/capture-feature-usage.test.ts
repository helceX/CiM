import { describe, expect, it, vi } from "vitest";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale as enforce-retention.test.ts. Proves one org's failure
 * doesn't stop every org ordered after it from getting a usage snapshot.
 */
const listActiveOrganizationsForUsageCapture = vi.fn();
const captureFeatureUsageSnapshot = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  listActiveOrganizationsForUsageCapture: (...args: unknown[]) =>
    listActiveOrganizationsForUsageCapture(...args),
  captureFeatureUsageSnapshot: (...args: unknown[]) => captureFeatureUsageSnapshot(...args),
}));

const { processCaptureFeatureUsageJob } = await import("./capture-feature-usage");

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
});
