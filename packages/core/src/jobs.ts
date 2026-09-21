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
} as const;

export type SendEmailJobData = {
  emailOutboxId: string;
};

export type CrawlSourceJobData = {
  sourceId: string;
};

export type CrawlSchedulerJobData = Record<string, never>;
