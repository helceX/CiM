import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
const getBillingProfile = vi.fn();
const upsertBillingProfile = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  getBillingProfile: (...a: unknown[]) => getBillingProfile(...a),
  upsertBillingProfile: (...a: unknown[]) => upsertBillingProfile(...a),
  recordAuditLog: (...a: unknown[]) => recordAuditLog(...a),
}));

const route = await import("./route");

const ctx = { organizationId: "org-1", userId: "user-1" };
const valid = {
  legalName: "Acme Medya A.Ş.",
  taxOffice: "Kadıköy",
  taxId: "1234567890",
  addressLine: "Örnek Mah. 1. Sok. No:2",
  city: "İstanbul",
  invoiceEmail: "Fatura@Acme.com",
};
const put = (body: unknown) =>
  new Request("http://localhost/api/billing-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("billing profile API", () => {
  it("requires org:manage_billing for read and write and touches nothing otherwise", async () => {
    requirePermission.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await route.GET()).status).toBe(403);
    expect((await route.PUT(put(valid))).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith("org:manage_billing");
    expect(getBillingProfile).not.toHaveBeenCalled();
    expect(upsertBillingProfile).not.toHaveBeenCalled();
  });

  it("answers 401 when not signed in", async () => {
    requirePermission.mockRejectedValue(new Error("UNAUTHENTICATED"));
    expect((await route.GET()).status).toBe(401);
  });

  it("rejects a tax number with a wrong check digit", async () => {
    requirePermission.mockResolvedValue(ctx);
    const response = await route.PUT(put({ ...valid, taxId: "1234567891" }));
    expect(response.status).toBe(400);
    expect(upsertBillingProfile).not.toHaveBeenCalled();
  });

  it("rejects missing fields and non-digit tax numbers", async () => {
    requirePermission.mockResolvedValue(ctx);
    expect((await route.PUT(put({ ...valid, legalName: "  " }))).status).toBe(400);
    expect((await route.PUT(put({ ...valid, taxId: "12345abcde" }))).status).toBe(400);
    expect((await route.PUT(put({ ...valid, invoiceEmail: "nope" }))).status).toBe(400);
  });

  it("saves scoped to the caller's organization, ignores a client-supplied one, and audits without the tax number", async () => {
    requirePermission.mockResolvedValue(ctx);
    upsertBillingProfile.mockResolvedValue({ id: "bp-1", legalName: valid.legalName, taxIdKind: "vkn" });
    const response = await route.PUT(put({ ...valid, organizationId: "org-evil" }));
    expect(response.status).toBe(200);
    const [, orgId, saved] = upsertBillingProfile.mock.calls[0]!;
    expect(orgId).toBe("org-1");
    expect(saved).not.toHaveProperty("organizationId");
    expect(saved.invoiceEmail).toBe("fatura@acme.com");
    const audit = recordAuditLog.mock.calls[0]![2];
    expect(audit.action).toBe("billing_profile.updated");
    expect(JSON.stringify(audit)).not.toContain(valid.taxId);
  });
});
