import { describe, expect, it, vi } from "vitest";

/**
 * A pure unit test (full mocks of @cim/core, @cim/db, and the route's own
 * lib dependencies) rather than an integration test — proving the route
 * never clears the session cookie on a failed deletion needs forcing
 * deleteUserAccount to fail on demand, which a real Postgres call can't do
 * on cue. Same approach as apps/worker/src/ai/enrich.test.ts for the
 * analogous "no false-success record on partial failure" invariant.
 */
const getCurrentUser = vi.fn();
const destroyCurrentSession = vi.fn();
const checkRateLimit = vi.fn();
const verifyPassword = vi.fn();
const findUserById = vi.fn();
const listSoleOwnedOrganizations = vi.fn();
const listMembershipOrganizationIdsForAudit = vi.fn();
const deleteUserAccount = vi.fn();

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
  deleteUserAccount: (...args: unknown[]) => deleteUserAccount(...args),
}));

const { POST } = await import("./route");

function makeRequest(password: string): Request {
  return new Request("http://localhost/api/account/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

describe("POST /api/account/delete", () => {
  it("does not clear the session when deleteUserAccount fails", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "user-1" });
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    findUserById.mockResolvedValueOnce({ id: "user-1", passwordHash: "hash" });
    verifyPassword.mockResolvedValueOnce(true);
    listSoleOwnedOrganizations.mockResolvedValueOnce([]);
    listMembershipOrganizationIdsForAudit.mockResolvedValueOnce(["org-1"]);
    deleteUserAccount.mockRejectedValueOnce(new Error("transient DB error"));

    await expect(POST(makeRequest("correct-password"))).rejects.toThrow("transient DB error");

    expect(destroyCurrentSession).not.toHaveBeenCalled();
  });

  it("deletes the account and clears the session on success", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "user-2" });
    checkRateLimit.mockResolvedValueOnce({ allowed: true });
    findUserById.mockResolvedValueOnce({ id: "user-2", passwordHash: "hash" });
    verifyPassword.mockResolvedValueOnce(true);
    listSoleOwnedOrganizations.mockResolvedValueOnce([]);
    listMembershipOrganizationIdsForAudit.mockResolvedValueOnce(["org-2"]);
    deleteUserAccount.mockResolvedValueOnce(undefined);
    destroyCurrentSession.mockResolvedValueOnce(undefined);

    const response = await POST(makeRequest("correct-password"));
    expect(response.status).toBe(200);

    expect(deleteUserAccount).toHaveBeenCalledWith(expect.anything(), "user-2", ["org-2"]);
    const deleteCallOrder = deleteUserAccount.mock.invocationCallOrder[0]!;
    const destroyCallOrder = destroyCurrentSession.mock.invocationCallOrder[0]!;
    expect(destroyCallOrder).toBeGreaterThan(deleteCallOrder);
  });
});
