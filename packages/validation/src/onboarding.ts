import { z } from "zod";

export const trackingTargetSchema = z.enum([
  "company",
  "brand",
  "product",
  "competitor",
  "campaign",
  "topic",
  "person",
  "industry",
]);
export type TrackingTarget = z.infer<typeof trackingTargetSchema>;

export const sourceTypeSelectionSchema = z.enum([
  "news",
  "web",
  "social",
  "video",
  "podcast",
  "forums",
  "comments",
  "all",
]);
export type SourceTypeSelection = z.infer<typeof sourceTypeSelectionSchema>;

export const notificationPreferenceSchema = z.enum([
  "instant",
  "high_priority_only",
  "daily_digest",
  "weekly_summary",
]);
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;

export const completeOnboardingSchema = z.object({
  trackingTarget: trackingTargetSchema,
  keywords: z
    .array(z.string().trim().min(1).max(120))
    .min(1, "Add at least one keyword")
    .max(20),
  sourceTypes: z.array(sourceTypeSelectionSchema).min(1, "Choose at least one source"),
  notificationPreference: notificationPreferenceSchema,
  projectName: z.string().trim().min(1).max(160),
});
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
