import { describe, expect, it } from "vitest";
import { can, isOrgRole, ORG_ROLES, permissionsForRole } from "./authz";

describe("authz", () => {
  it("grants owners and admins every permission", () => {
    for (const permission of permissionsForRole("organization_owner")) {
      expect(can("organization_owner", permission)).toBe(true);
    }
    expect(permissionsForRole("organization_admin")).toEqual(
      permissionsForRole("organization_owner"),
    );
  });

  it("never lets a viewer write", () => {
    expect(can("viewer", "monitoring:write")).toBe(false);
    expect(can("viewer", "mentions:write")).toBe(false);
    expect(can("viewer", "org:manage_members")).toBe(false);
  });

  it("restricts report recipients to reading reports only", () => {
    expect(permissionsForRole("report_recipient")).toEqual(["reports:read"]);
  });

  it("validates role strings defensively (never trusts client-supplied roles)", () => {
    expect(isOrgRole("organization_owner")).toBe(true);
    expect(isOrgRole("super_hacker")).toBe(false);
  });

  it("covers every declared role", () => {
    for (const role of ORG_ROLES) {
      expect(() => permissionsForRole(role)).not.toThrow();
    }
  });
});
