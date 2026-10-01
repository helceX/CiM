import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const getEmailById = vi.fn();
const markEmailSent = vi.fn();
const recordEmailError = vi.fn();
const deliver = vi.fn();
let provider = "resend";

vi.mock("@cim/db", () => ({
  db: {},
  getEmailById: (...a: unknown[]) => getEmailById(...a),
  markEmailSent: (...a: unknown[]) => markEmailSent(...a),
  recordEmailError: (...a: unknown[]) => recordEmailError(...a),
}));
vi.mock("@cim/config", () => ({ getEnv: () => ({ EMAIL_PROVIDER: provider }) }));
vi.mock("@cim/core", () => ({ deliverEmailViaProvider: (...a: unknown[]) => deliver(...a) }));

const { processSendEmailJob } = await import("./send-email");
const job = { data: { emailOutboxId: "e1" } } as Job<{ emailOutboxId: string }>;
const row = { id: "e1", toEmail: "a@b.co", subject: "s", bodyText: "b", sentAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  provider = "resend";
});

describe("processSendEmailJob", () => {
  it("records which provider actually delivered the message", async () => {
    getEmailById.mockResolvedValue(row);
    await processSendEmailJob(job);
    expect(markEmailSent).toHaveBeenCalledWith({}, "e1", "resend");

    provider = "console";
    await processSendEmailJob(job);
    expect(markEmailSent).toHaveBeenLastCalledWith({}, "e1", "console");
  });

  it("stores the failure for /admin and rethrows so the queue still retries", async () => {
    getEmailById.mockResolvedValue(row);
    deliver.mockRejectedValue(new Error("Resend API request failed (403): domain not verified"));
    await expect(processSendEmailJob(job)).rejects.toThrow("domain not verified");
    expect(recordEmailError).toHaveBeenCalledWith({}, "e1", expect.stringContaining("domain not verified"));
    expect(markEmailSent).not.toHaveBeenCalled();
  });

  it("does nothing for an already-sent message", async () => {
    getEmailById.mockResolvedValue({ ...row, sentAt: new Date() });
    await processSendEmailJob(job);
    expect(deliver).not.toHaveBeenCalled();
  });
});
