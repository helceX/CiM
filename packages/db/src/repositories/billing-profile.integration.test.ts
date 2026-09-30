import { describe, expect, it } from "vitest";
import { db } from "../client";
import { organizations } from "../schema/index";
import { getBillingProfile, upsertBillingProfile } from "./billing-profile";
import { asOrganizationId } from "./tenant-scope";

async function makeOrg(label: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `${label} Co`, slug: `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}` })
    .returning();
  if (!org) throw new Error("org");
  return asOrganizationId(org.id);
}

const base = {
  legalName: "Acme Medya A.Ş.",
  taxOffice: "Kadıköy",
  taxId: "1234567890",
  addressLine: "Örnek Mah. 1. Sok. No:2",
  district: "Kadıköy",
  city: "İstanbul",
  postalCode: "34700",
  country: "TR",
  invoiceEmail: "fatura@acme.com",
};

describe("billing profile repository", () => {
  it("returns nothing before the first save", async () => {
    expect(await getBillingProfile(db, await makeOrg("bp-empty"))).toBeUndefined();
  });

  it("creates then replaces a single row per organization and records the tax-id kind", async () => {
    const org = await makeOrg("bp-upsert");
    const first = await upsertBillingProfile(db, org, base);
    expect(first.taxIdKind).toBe("vkn");

    const second = await upsertBillingProfile(db, org, {
      ...base,
      legalName: "Acme Yayıncılık Ltd.",
      taxId: "10000000146",
    });
    expect(second.id).toBe(first.id);
    expect(second.legalName).toBe("Acme Yayıncılık Ltd.");
    expect(second.taxIdKind).toBe("tckn");
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
  });

  it("rejects an invalid tax number without writing", async () => {
    const org = await makeOrg("bp-invalid");
    await expect(upsertBillingProfile(db, org, { ...base, taxId: "1234567891" })).rejects.toThrow(
      "Invalid tax number",
    );
    expect(await getBillingProfile(db, org)).toBeUndefined();
  });

  it("never exposes one organization's profile to another", async () => {
    const a = await makeOrg("bp-a");
    const b = await makeOrg("bp-b");
    await upsertBillingProfile(db, a, base);
    expect(await getBillingProfile(db, b)).toBeUndefined();
    await upsertBillingProfile(db, b, { ...base, legalName: "Other Co" });
    expect((await getBillingProfile(db, a))?.legalName).toBe("Acme Medya A.Ş.");
  });
});
