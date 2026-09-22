import { z } from "zod";

export const reportTemplateKeySchema = z.enum([
  "weekly_summary",
  "monitoring_overview",
]);
export const reportPeriodTypeSchema = z.enum(["rolling_7d", "rolling_30d"]);
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

export const createReportSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(160),
  templateKey: reportTemplateKeySchema,
  periodType: reportPeriodTypeSchema,
});
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
