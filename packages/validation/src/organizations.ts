import { z } from "zod";

/**
 * docs/product/FEATURE_MATRIX.md P2 "Slack/Teams/webhook channels".
 * https-only — alert payloads carry real content, and every major
 * webhook provider (Slack/Teams included) requires https anyway.
 * An empty string clears the configured webhook (see updateOrganizationWebhookUrl).
 */
export const updateOrganizationWebhookSchema = z.object({
  webhookUrl: z.union([
    z.literal(""),
    z
      .url()
      .refine((url) => url.startsWith("https://"), "Webhook URL must use https://"),
  ]),
});
export type UpdateOrganizationWebhookInput = z.infer<
  typeof updateOrganizationWebhookSchema
>;
