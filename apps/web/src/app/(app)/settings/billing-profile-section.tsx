"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@cim/ui";

export type BillingProfileView = {
  legalName: string;
  taxOffice: string;
  taxId: string;
  taxIdKind: "vkn" | "tckn";
  addressLine: string;
  district: string;
  city: string;
  postalCode: string;
  invoiceEmail: string;
};

/**
 * Invoice details (docs/product/BILLING_DECISION.md). Only rendered for
 * members with org:manage_billing; the page never sends the profile to
 * anyone else. Saving doesn't start a subscription — paid plans aren't live.
 */
export function BillingProfileSection({ profile }: { profile: BillingProfileView | null }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSaved(false);
    setIsSaving(true);
    const form = new FormData(event.currentTarget);
    const get = (name: string) => String(form.get(name) ?? "");
    try {
      const response = await fetch("/api/billing-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: get("legalName"),
          taxOffice: get("taxOffice"),
          taxId: get("taxId"),
          addressLine: get("addressLine"),
          district: get("district"),
          city: get("city"),
          postalCode: get("postalCode"),
          invoiceEmail: get("invoiceEmail"),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const next: Record<string, string> = {};
        for (const issue of data.issues ?? []) {
          const key = issue.path?.[0];
          if (typeof key === "string" && !next[key]) next[key] = issue.message;
        }
        setFieldErrors(next);
        if (Object.keys(next).length === 0) {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">Invoice details</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        The company details that will appear on your invoices. Paid plans aren&apos;t available yet —
        saving this doesn&apos;t start a subscription.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3" noValidate>
        <Field id="bp-legalName" label="Company name (as registered)" error={fieldErrors.legalName} required>
          <Input name="legalName" defaultValue={profile?.legalName ?? ""} autoComplete="organization" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="bp-taxOffice" label="Tax office" error={fieldErrors.taxOffice} required>
            <Input name="taxOffice" defaultValue={profile?.taxOffice ?? ""} />
          </Field>
          <Field
            id="bp-taxId"
            label="Tax number (VKN / TCKN)"
            hint="10 digits for a company, 11 for a sole proprietor."
            error={fieldErrors.taxId}
            required
          >
            <Input name="taxId" inputMode="numeric" defaultValue={profile?.taxId ?? ""} />
          </Field>
        </div>
        <Field id="bp-addressLine" label="Address" error={fieldErrors.addressLine} required>
          <Input name="addressLine" defaultValue={profile?.addressLine ?? ""} autoComplete="street-address" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="bp-district" label="District" error={fieldErrors.district}>
            <Input name="district" defaultValue={profile?.district ?? ""} />
          </Field>
          <Field id="bp-city" label="City" error={fieldErrors.city} required>
            <Input name="city" defaultValue={profile?.city ?? ""} autoComplete="address-level2" />
          </Field>
          <Field id="bp-postalCode" label="Postal code" error={fieldErrors.postalCode}>
            <Input name="postalCode" defaultValue={profile?.postalCode ?? ""} autoComplete="postal-code" />
          </Field>
        </div>
        <Field
          id="bp-invoiceEmail"
          label="Invoice email"
          hint="Invoices are sent here."
          error={fieldErrors.invoiceEmail}
          required
        >
          <Input name="invoiceEmail" type="email" defaultValue={profile?.invoiceEmail ?? ""} />
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="text-sm text-foreground">
            Invoice details saved.
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save invoice details"}
          </Button>
        </div>
      </form>
    </section>
  );
}
