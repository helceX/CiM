/**
 * Job names + payload shapes shared between the producer (apps/web API
 * routes, apps/worker's own scheduler) and the consumer (apps/worker) so
 * they can't drift out of sync (docs/architecture/INGESTION.md job
 * system). AI/report job types are added here as each pipeline stage
 * ships, following the same pattern.
 */
export const QUEUE_NAMES = {
  sendEmail: "send_email",
  crawlSource: "crawl_source",
  crawlScheduler: "crawl_scheduler",
  alertSpikeCheck: "alert_spike_check",
  alertSentimentShiftCheck: "alert_sentiment_shift_check",
  alertEmergingTopicCheck: "alert_emerging_topic_check",
  alertCompetitorCheck: "alert_competitor_check",
  aiEnrich: "ai_enrich",
  insightGenerate: "insight_generate",
  generateReport: "generate_report",
  generateDigest: "generate_digest",
  generateScheduledReports: "generate_scheduled_reports",
  enforceRetention: "enforce_retention",
  captureFeatureUsage: "capture_feature_usage",
} as const;

export type SendEmailJobData = {
  emailOutboxId: string;
};

export type CrawlSourceJobData = {
  sourceId: string;
};

export type CrawlSchedulerJobData = Record<string, never>;

export type AlertSpikeCheckJobData = Record<string, never>;

export type AlertSentimentShiftCheckJobData = Record<string, never>;

export type AlertEmergingTopicCheckJobData = Record<string, never>;

export type AlertCompetitorCheckJobData = Record<string, never>;

export type AiEnrichJobData = Record<string, never>;

export type InsightGenerateJobData = Record<string, never>;

export type GenerateReportJobData = {
  reportRunId: string;
};

export type GenerateDigestJobData = Record<string, never>;

export type GenerateScheduledReportsJobData = Record<string, never>;

export type EnforceRetentionJobData = Record<string, never>;

export type CaptureFeatureUsageJobData = Record<string, never>;
