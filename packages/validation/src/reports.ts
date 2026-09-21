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
