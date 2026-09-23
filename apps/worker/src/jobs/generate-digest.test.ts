import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale as enforce-retention.test.ts. Proves one org's failure
 * doesn't stop the digest from being sent to every org ordered after it.
 */
const listActiveOrganizationIdsForDigest = vi.fn();
const getDigestSummaryForOrganization = vi.fn();
const listActiveMemberEmails = vi.fn();
const enqueueEmail = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  listActiveOrganizationIdsForDigest: (...args: unknown[]) => listActiveOrganizationIdsForDigest(...args),
  getDigestSummaryForOrganization: (...args: unknown[]) => getDigestSummaryForOrganization(...args),
  listActiveMemberEmails: (...args: unknown[]) => listActiveMemberEmails(...args),
  enqueueEmail: (...args: unknown[]) => enqueueEmail(...args),
}));

const { processGenerateDigestJob } = await import("./generate-digest");

function fakeSummary(overrides: Partial<{ totalNewMentions: number }> = {}) {
  return {
    totalNewMentions: overrides.totalNewMentions ?? 1,
    sentimentCounts: { positive: 1, neutral: 0, negative: 0, unclassified: 0 },
    topMentions: [],
  };
}

describe("processGenerateDigestJob — per-org failure isolation", () => {
  it("still emails org 2's digest when org 1's summary lookup throws", async () => {
    listActiveOrganizationIdsForDigest.mockResolvedValueOnce(["org-1", "org-2"]);
    getDigestSummaryForOrganization.mockRejectedValueOnce(new Error("transient DB error"));
    getDigestSummaryForOrganization.mockResolvedValueOnce(fakeSummary());
    listActiveMemberEmails.mockResolvedValueOnce([{ email: "member@example.com" }].map((m) => m.email));
    enqueueEmail.mockResolvedValueOnce({ id: "outbox-1" });

    const emailQueue = { add: vi.fn().mockResolvedValueOnce(undefined) } as unknown as Queue<SendEmailJobData>;

    await processGenerateDigestJob(emailQueue);

    expect(getDigestSummaryForOrganization).toHaveBeenCalledTimes(2);
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(emailQueue.add).toHaveBeenCalledTimes(1);
  });
});
