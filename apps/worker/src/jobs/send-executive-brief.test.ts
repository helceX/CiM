import { describe, expect, it, vi } from "vitest";
import type { Queue } from "bullmq";
import type { SendEmailJobData } from "@cim/core";

/**
 * A pure unit test (mocking @cim/db entirely, no real Postgres) — same
 * rationale as enforce-retention.test.ts. Proves one org's failure
 * doesn't stop the brief from being sent to every org ordered after it.
 */
const listActiveOrganizationIdsForDigest = vi.fn();
const getLatestInsightForOrganization = vi.fn();
const listActiveMemberEmails = vi.fn();
const enqueueEmail = vi.fn();

vi.mock("@cim/db", () => ({
  db: {},
  listActiveOrganizationIdsForDigest: (...args: unknown[]) => listActiveOrganizationIdsForDigest(...args),
  getLatestInsightForOrganization: (...args: unknown[]) => getLatestInsightForOrganization(...args),
  listActiveMemberEmails: (...args: unknown[]) => listActiveMemberEmails(...args),
  enqueueEmail: (...args: unknown[]) => enqueueEmail(...args),
}));

const { processSendExecutiveBriefJob } = await import("./send-executive-brief");

function freshBrief() {
  return {
    projectName: "Test Project",
    summary: "Things happened.",
    createdAt: new Date(),
    evidence: [{ mentionId: "m-1", title: "A story", sourceName: "Wire" }],
  };
}

describe("processSendExecutiveBriefJob — per-org failure isolation", () => {
  it("still emails org 2's brief when org 1's insight lookup throws", async () => {
    listActiveOrganizationIdsForDigest.mockResolvedValueOnce(["org-1", "org-2"]);
    getLatestInsightForOrganization.mockRejectedValueOnce(new Error("transient DB error"));
    getLatestInsightForOrganization.mockResolvedValueOnce(freshBrief());
    listActiveMemberEmails.mockResolvedValueOnce(["member@example.com"]);
    enqueueEmail.mockResolvedValueOnce({ id: "outbox-1" });

    const emailQueue = { add: vi.fn().mockResolvedValueOnce(undefined) } as unknown as Queue<SendEmailJobData>;

    await processSendExecutiveBriefJob(emailQueue);

    expect(getLatestInsightForOrganization).toHaveBeenCalledTimes(2);
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(emailQueue.add).toHaveBeenCalledTimes(1);
  });
});
