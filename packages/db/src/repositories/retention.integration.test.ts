import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../client";
import { organizations } from "../schema/index";
import { asOrganizationId } from "./tenant-scope";
import { getRetentionPolicy, upsertRetentionPolicy } from "./retention";

describe("retention repository (integration)", () => {
  let organizationId: ReturnType<typeof asOrganizationId>;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Retention Test Org", slug: `retention-test-${Date.now()}` })
      .returning();
    if (!org) throw new Error("failed to create test organization");
    organizationId = asOrganizationId(org.id);
  });

  it("defaults to keep-forever when no policy row exists", async () => {
    const policy = await getRetentionPolicy(db, organizationId);
    expect(policy).toEqual({ mentionRetentionDays: null });
  });

  it("creates a policy row on first configure and reads it back", async () => {
    await upsertRetentionPolicy(db, organizationId, { mentionRetentionDays: 90 });

    const policy = await getRetentionPolicy(db, organizationId);
    expect(policy).toEqual({ mentionRetentionDays: 90 });
  });

  it("updates the existing row in place rather than creating a second one", async () => {
    await upsertRetentionPolicy(db, organizationId, { mentionRetentionDays: 90 });
    await upsertRetentionPolicy(db, organizationId, { mentionRetentionDays: 365 });

    const policy = await getRetentionPolicy(db, organizationId);
    expect(policy).toEqual({ mentionRetentionDays: 365 });
  });

  it("can be set back to keep-forever", async () => {
    await upsertRetentionPolicy(db, organizationId, { mentionRetentionDays: 90 });
    await upsertRetentionPolicy(db, organizationId, { mentionRetentionDays: null });

    const policy = await getRetentionPolicy(db, organizationId);
    expect(policy).toEqual({ mentionRetentionDays: null });
  });
});
