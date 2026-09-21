/**
 * Job names + payload shapes shared between the producer (apps/web API
 * routes) and the consumer (apps/worker) so they can't drift out of sync
 * (docs/architecture/INGESTION.md job system). MVP ships one real queue
 * (send_email); ingestion/AI/report job types are added here as each
 * pipeline stage ships, following the same pattern.
 */
export const QUEUE_NAMES = {
  sendEmail: "send_email",
} as const;

export type SendEmailJobData = {
  emailOutboxId: string;
};
