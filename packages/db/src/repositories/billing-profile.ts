import { eq } from "drizzle-orm";
import { classifyTaxId } from "@cim/core";
import type { Db } from "../client";
import { billingProfiles } from "../schema/billing";
import type { OrganizationId } from "./tenant-scope";

export type BillingProfileInput = {
  legalName: string;
  taxOffice: string;
  taxId: string;
  addressLine: string;
  district: string;
  city: string;
  postalCode: string;
  country: string;
  invoiceEmail: string;
};

export async function getBillingProfile(db: Db, organizationId: OrganizationId) {
  const [profile] = await db
    .select()
    .from(billingProfiles)
    .where(eq(billingProfiles.organizationId, organizationId))
    .limit(1);
  return profile;
}

/** Creates or replaces the org's single billing profile. Throws on an invalid tax number. */
export async function upsertBillingProfile(
  db: Db,
  organizationId: OrganizationId,
  input: BillingProfileInput,
) {
  const taxIdKind = classifyTaxId(input.taxId);
  if (!taxIdKind) throw new Error("Invalid tax number");
  const values = { ...input, taxIdKind };
  const [profile] = await db
    .insert(billingProfiles)
    .values({ organizationId, ...values })
    .onConflictDoUpdate({
      target: billingProfiles.organizationId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  if (!profile) throw new Error("Failed to save billing profile");
  return profile;
}
