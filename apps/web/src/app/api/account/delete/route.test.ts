import { describe, expect, it, vi } from "vitest";

/**
 * A pure unit test (full mocks of @cim/core, @cim/db, and the route's own
 * lib dependencies) rather than an integration test — proving a specific
 * ordering invariant (audit log written only after anonymizeUser actually
 * commits) needs forcing anonymizeUser to fail on demand, which a real
 * Postgres call can't do on cue. Same approach as apps/worker/src/ai/
 * enrich.test.ts for the analogous "no false-success record on partial
 * failure" invariant.
 */
const getCurrentUser = vi.fn();
const destroyCurrentSession = vi.fn();
const checkRateLimit = vi.fn();
const verifyPassword = vi.fn();
const findUserById = vi.fn();
const listSoleOwnedOrganizations = vi.fn();
const listMembershipOrganizationIdsForAudit = vi.fn();
const anonymizeUser = vi.fn();
const recordAuditLog = vi.fn();
const revokeAllSessionsForUser = vi.fn();

vi.mock("@/lib/session", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUser(...args),
  destroyCurrentSession: (...args: unknown[]) => destroyCurrentSession(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));
vi.mock("@cim/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cim/core")>()),
  verifyPassword: (...args: unknown[]) => verifyPassword(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  findUserById: (...args: unknown[]) => findUserById(...args),
  listSoleOwnedOrganizations: (...args: unknown[]) => listSoleOwnedOrganizations(...args),
  listMembershipOrganizationIdsForAudit: (...args: unknown[]) =>
    listMembershipOrganizationIdsForAudit(...args),
  anonymizeUser: (...args: unknown[]) => anonymizeUser(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
  revokeAllSessionsForUser: (...args: unknown[]) => revokeAllSessionsForUser(...args),
}));

const { POST } = await import("./route");

function makeRequest(password: string): Request {
  return new Request("http://localhost/api/account/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

describe("POST /api/account/delete — audit-log ordering", () => {
  it("does not record account.deleted when anonymizeUser fails", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    findUserById.mockResolvedValueOnce({ id: "user-1", passwordHash: "hash" });
    verifyPassword.mockResolvedValueOnce(true);
    listSoleOwnedOrganizations.mockResolvedValueOnce([]);
    listMembershipOrganizationIdsForAudit.mockResolvedValueOnce(["org-1"]);
    anonymizeUser.mockRejectedValueOnce(new Error("transient DB error"));

    await expect(POST(makeRequest("correct-password"))).rejects.toThrow("transient DB error");

    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("records account.deleted only after anonymizeUser has actually succeeded", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "user-2" });
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    findUserById.mockResolvedValueOnce({ id: "user-2", passwordHash: "hash" });
    verifyPassword.mockResolvedValueOnce(true);
    listSoleOwnedOrganizations.mockResolvedValueOnce([]);
    listMembershipOrganizationIdsForAudit.mockResolvedValueOnce(["org-2"]);
    anonymizeUser.mockResolvedValueOnce(undefined);
    revokeAllSessionsForUser.mockResolvedValueOnce(undefined);
    destroyCurrentSession.mockResolvedValueOnce(undefined);

    const response = await POST(makeRequest("correct-password"));
    expect(response.status).toBe(200);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      "org-2",
      expect.objectContaining({ action: "account.deleted" }),
    );
    const anonymizeCallOrder = anonymizeUser.mock.invocationCallOrder[0]!;
    const auditCallOrder = recordAuditLog.mock.invocationCallOrder[0]!;
    expect(auditCallOrder).toBeGreaterThan(anonymizeCallOrder);
  });
});
