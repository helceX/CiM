import { z } from "zod";

export const alertRuleTypeSchema = z.enum([
  "keyword",
  "high_relevance",
  "spike",
  "sentiment_shift",
]);
export const alertChannelSchema = z.enum(["in_app", "email", "webhook"]);

export const createAlertRuleSchema = z.object({
  projectId: z.uuid(),
  queryId: z.uuid(),
  name: z.string().trim().min(1, "Name is required").max(160),
  type: alertRuleTypeSchema,
  channels: z.array(alertChannelSchema).min(1, "Choose at least one channel"),
  cooldownMinutes: z.coerce.number().int().min(5).max(1440).default(60),
});
export type CreateAlertRuleInput = z.infer<typeof createAlertRuleSchema>;
