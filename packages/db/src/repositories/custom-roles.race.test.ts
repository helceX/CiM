import { describe, expect, it } from "vitest";
import type { Db } from "../client";
import type { OrganizationId } from "./tenant-scope";
import { createCustomRole, updateCustomRole } from "./custom-roles";

/**
 * Real concurrent Promise.all calls against a real Postgres instance
 * don't reliably reproduce the TOCTOU window between the pre-check
 * SELECT and the mutating query (the race window is a matter of
 * microseconds; whether two real requests actually land inside it is
 * non-deterministic and flaked in both directions during development of
 * this fix). Testing it as a genuine race would mean holding open a
 * manually-managed transaction to force the interleaving — instead,
 * this mocks the DB client to simulate exactly what a losing race looks
 * like from `updateCustomRole`/`createCustomRole`'s point of view: the
 * pre-check SELECT finds nothing, but the mutating query itself then
 * hits `custom_roles_org_name_lower_uidx`. Deterministic, and it
 * exercises the same catch/onConflictDoNothing logic a real race would.
 */
function uniqueViolationError(): Error {
  const cause = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
  });
  return Object.assign(new Error("Failed query"), { cause });
}

const organizationId = "org-1" as OrganizationId;

describe("custom-roles repository — losing a name-uniqueness race (mocked)", () => {
  it("createCustomRole returns name_taken, not an unhandled error, when onConflictDoNothing yields no row", async () => {
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
      insert: () => ({
        values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }) }),
      }),
    } as unknown as Db;

    const result = await createCustomRole(fakeDb, organizationId, {
      name: "Race Winner",
      permissions: ["mentions:read"],
    });
    expect(result).toEqual({ ok: false, reason: "name_taken" });
  });

  it("updateCustomRole returns name_taken, not an unhandled error, when the UPDATE itself hits the unique index", async () => {
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
      update: () => ({
        set: () => ({ where: () => ({ returning: () => Promise.reject(uniqueViolationError()) }) }),
      }),
    } as unknown as Db;

    const result = await updateCustomRole(fakeDb, organizationId, "role-1", {
      name: "Race Target",
      permissions: ["mentions:read"],
    });
    expect(result).toEqual({ ok: false, reason: "name_taken" });
  });

  it("updateCustomRole still lets a genuinely different database error propagate", async () => {
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
      update: () => ({
        set: () => ({
          where: () => ({ returning: () => Promise.reject(new Error("connection terminated")) }),
        }),
      }),
    } as unknown as Db;

    await expect(
      updateCustomRole(fakeDb, organizationId, "role-1", {
        name: "Race Target",
        permissions: ["mentions:read"],
      }),
    ).rejects.toThrow("connection terminated");
  });
});
