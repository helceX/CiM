import { z } from "zod";
import { classifyTaxId } from "@cim/core";

const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default("");

/**
 * Invoice details. The tax number is checked for length and check digits
 * (VKN 10 / TCKN 11) so a typo is rejected here instead of on a legal invoice.
 */
export const upsertBillingProfileSchema = z
  .object({
    legalName: text("Company name", 200),
    taxOffice: text("Tax office", 120),
    taxId: z
      .string()
      .trim()
      .regex(/^\d{10,11}$/, "Tax number must be 10 digits (VKN) or 11 digits (TCKN)"),
    addressLine: text("Address", 300),
    district: optionalText(100),
    city: text("City", 100),
    postalCode: optionalText(20),
    // Invoicing is Turkey-only for now (e-Fatura / e-Arşiv); widen when that changes.
    country: z.literal("TR").default("TR"),
    invoiceEmail: z.email().max(255).toLowerCase(),
  })
  .superRefine((value, ctx) => {
    if (classifyTaxId(value.taxId) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["taxId"],
        message: "This tax number is not valid — check for a typo",
      });
    }
  });
export type UpsertBillingProfileInput = z.infer<typeof upsertBillingProfileSchema>;
