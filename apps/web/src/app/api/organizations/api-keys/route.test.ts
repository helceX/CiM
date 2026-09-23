import { describe, expect, it, vi } from "vitest";

/**
 * Full-mock unit test, same rationale as apps/web/src/app/api/alerts/
 * route.test.ts — proves POST /api/organizations/api-keys can't mint a
 * key scoped to a permission the creating user's own role doesn't hold.
 * Regression: createApiKeySchema only validates that each requested
 * scope is a real Permission, not that the caller actually has it — a
 * role granted nothing but api_keys:manage could otherwise request
 * scopes: ["org:manage_billing", ...] and receive a working key with
 * permissions its own role never had (privilege escalation).
 */
const requirePermission = vi.fn();
const createApiKey = vi.fn();
const listApiKeys = vi.fn();
const recordAuditLog = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
}));
vi.mock("@cim/db", () => ({
  db: {},
  createApiKey: (...args: unknown[]) => createApiKey(...args),
  listApiKeys: (...args: unknown[]) => listApiKeys(...args),
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

const { POST } = await import("./route");

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/organizations/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/organizations/api-keys — scope ceiling", () => {
  it("rejects a request for a scope the caller's own role doesn't hold", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      // A custom role granted nothing but api_keys:manage.
      permissions: ["api_keys:manage"],
    });

    const response = await POST(
      makeRequest({ name: "Escalation attempt", scopes: ["api_keys:manage", "org:manage_billing"] }),
    );
    expect(response.status).toBe(403);
    expect(createApiKey).not.toHaveBeenCalled();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("creates the key when every requested scope is one the caller's own role holds", async () => {
    requirePermission.mockResolvedValueOnce({
      organizationId: "org-1",
      userId: "user-1",
      permissions: ["api_keys:manage", "mentions:read"],
    });
    createApiKey.mockResolvedValueOnce({
      rawKey: "cim_raw",
      summary: { id: "key-1", name: "Read-only key", scopes: ["mentions:read"] },
    });

    const response = await POST(
      makeRequest({ name: "Read-only key", scopes: ["mentions:read"] }),
    );
    expect(response.status).toBe(201);
    expect(createApiKey).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      expect.objectContaining({ scopes: ["mentions:read"] }),
    );
  });
});
