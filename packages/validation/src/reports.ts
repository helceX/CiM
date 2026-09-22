import { z } from "zod";

export const reportTemplateKeySchema = z.enum([
  "weekly_summary",
  "monitoring_overview",
  "custom",
]);
export const reportPeriodTypeSchema = z.enum(["rolling_7d", "rolling_30d"]);
// Mirrors packages/reports/src/sections.ts's REPORT_SECTION_KEYS — kept
// here rather than imported since @cim/validation sits below @cim/reports
// in the dependency graph (same layering as trackingTargetSchema below).
export const reportSectionKeySchema = z.enum([
  "trend",
  "sentiment",
  "sources",
  "topics",
  "top_stories",
  "competitors",
  "ai_insight",
  "recommendations",
]);
export const reportScheduleFrequencySchema = z.enum([
  "none",
  "weekly",
  "monthly",
  "yearly",
]);

export const updateReportScheduleSchema = z.object({
  scheduleFrequency: reportScheduleFrequencySchema,
});
export type UpdateReportScheduleInput = z.infer<typeof updateReportScheduleSchema>;

export const createReportSchema = z
  .object({
    projectId: z.uuid(),
    name: z.string().trim().min(1, "Name is required").max(160),
    templateKey: reportTemplateKeySchema,
    sections: z.array(reportSectionKeySchema).max(reportSectionKeySchema.options.length).optional(),
    periodType: reportPeriodTypeSchema,
  })
  .refine(
    (input) => input.templateKey !== "custom" || (input.sections?.length ?? 0) > 0,
    { message: "Choose at least one section", path: ["sections"] },
  );
export type CreateReportInput = z.infer<typeof createReportSchema>;

/**
 * docs/product/FEATURE_MATRIX.md P2 "sharing links" — no "forever"
 * option (packages/db/src/schema/reports.ts's reportShareLinks
 * comment); 7 days is a sensible default for "send this to a colleague
 * or client", 90 days a generous ceiling.
 */
export const createReportShareLinkSchema = z.object({
  expiresInDays: z.int().min(1).max(90).default(7),
});
export type CreateReportShareLinkInput = z.infer<typeof createReportShareLinkSchema>;
