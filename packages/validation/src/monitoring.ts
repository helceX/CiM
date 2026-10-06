import { z } from "zod";
import { normalizeRegionScopes } from "@cim/core";
import { sourceTypeSelectionSchema, trackingTargetSchema } from "./onboarding";

export const createMonitoringQuerySchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(160),
  include: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  exclude: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  exactPhrases: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  sourceTypes: z.array(sourceTypeSelectionSchema).min(1, "Choose at least one source"),
  /** Continent codes (EUR …) and/or ISO country codes; empty or "world" = everywhere. Unknown values are dropped. */
  regionScopes: z
    .array(z.string().trim().min(1).max(8))
    .max(300)
    .default([])
    .transform((scopes) => normalizeRegionScopes(scopes)),
  trackingTarget: trackingTargetSchema.default("company"),
});
export type CreateMonitoringQueryInput = z.infer<typeof createMonitoringQuerySchema>;

export const previewMonitoringQuerySchema = z.object({
  regionScopes: z
    .array(z.string().trim().min(1).max(8))
    .max(300)
    .default([])
    .transform((scopes) => normalizeRegionScopes(scopes)),
  include: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  exclude: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  exactPhrases: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
});
export type PreviewMonitoringQueryInput = z.infer<typeof previewMonitoringQuerySchema>;
