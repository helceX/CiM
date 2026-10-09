import { z } from "zod";
import { normalizeAliasGroups, normalizeIntent, normalizeRegionScopes } from "@cim/core";
import { sourceTypeSelectionSchema, trackingTargetSchema } from "./onboarding";

const companySchema = z
  .object({
    name: z.string().trim().max(160).default(""),
    short: z.string().trim().max(40).optional(),
  })
  .optional()
  .transform((company) => (company && company.name ? { name: company.name, ...(company.short ? { short: company.short } : {}) } : undefined));

/** What the person wants from the monitoring (see @cim/core intent.ts): unknown goals are dropped, not rejected. */
const intentSchema = z
  .object({
    goals: z.array(z.string().max(40)).max(12).default([]),
    focus: z.string().max(20).optional(),
    signalWords: z.array(z.string().max(120)).max(60).default([]),
  })
  .optional()
  .transform((value) => normalizeIntent(value));

/** How to tell the person about a new monitoring's stories: a rule is created for "important" and "every". */
export const notifyModeSchema = z.enum(["none", "important", "every"]);
export const notifySchema = z.object({ mode: notifyModeSchema.default("none"), email: z.boolean().default(false) });

const monitoringFields = {
  name: z.string().trim().min(1, "Name is required").max(160),
  include: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  exclude: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  exactPhrases: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  sourceTypes: z.array(sourceTypeSelectionSchema).min(1, "Choose at least one source"),
  /** Names of the same thing (BTM = Bilgiyi Ticarileştirme Merkezi): grouped together in results. */
  aliasGroups: z
    .array(z.array(z.string().trim().min(1).max(120)).min(1).max(10))
    .max(30)
    .default([])
    .transform((groups) => normalizeAliasGroups(groups)),
  /** Continent codes (EUR …) and/or ISO country codes; empty or "world" = everywhere. Unknown values are dropped. */
  regionScopes: z
    .array(z.string().trim().min(1).max(8))
    .max(300)
    .default([])
    .transform((scopes) => normalizeRegionScopes(scopes)),
  trackingTarget: trackingTargetSchema.default("company"),
  /** The company being tracked: full name and optional short name (both are searched; see QueryAst.company). */
  company: companySchema,
  /** What the person is looking for and how much to show (stored on the query AST). */
  intent: intentSchema,
};

/** A new monitoring may also say how to be told about its stories; editing leaves existing alert rules alone. */
export const createMonitoringQuerySchema = z.object({ projectId: z.uuid(), ...monitoringFields, notify: notifySchema.optional() });
/** Editing a monitoring: the same fields, no project change. */
export const updateMonitoringQuerySchema = z.object(monitoringFields);
export type UpdateMonitoringQueryInput = z.infer<typeof updateMonitoringQuerySchema>;
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
  /** With these, the preview also says how many of the stories would be important. */
  trackingTarget: trackingTargetSchema.optional(),
  intent: intentSchema,
});
export type PreviewMonitoringQueryInput = z.infer<typeof previewMonitoringQuerySchema>;
