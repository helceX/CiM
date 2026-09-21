import {
  getDashboardSummary,
  getMentionVolumeSeries,
  getSentimentTrendSeries,
  getSourceDistribution,
  listRecentMentions,
  type Db,
  type DashboardSummary,
  type MentionListItem,
  type MentionVolumePoint,
  type OrganizationId,
  type SentimentTrendPoint,
  type SourceDistributionRow,
} from "@cim/db";
import { getReportTemplate, periodTypeToSinceDays, type ReportTemplateKey } from "./templates";

export type ReportData = {
  templateKey: ReportTemplateKey;
  projectName: string;
  periodStart: Date;
  periodEnd: Date;
  sinceDays: number;
  summary: DashboardSummary;
  volumeSeries: MentionVolumePoint[];
  sentimentSeries: SentimentTrendPoint[];
  sourceDistribution: SourceDistributionRow[];
  topStories: MentionListItem[];
};

/**
 * Reuses the same tenant-scoped analytics/mentions repositories the
 * Dashboard and Analytics screens already read (Phase 3/4) — a report is
 * a snapshot of real, already-proven data, never a parallel computation
 * that could drift from what the product shows on screen.
 */
export async function gatherReportData(
  db: Db,
  organizationId: OrganizationId,
  input: { projectId: string; projectName: string; templateKey: ReportTemplateKey; periodType: string },
): Promise<ReportData> {
  if (!getReportTemplate(input.templateKey)) {
    // Never silently fall back to a default layout for an unrecognized
    // template — a Report referencing a template outside the fixed
    // registry is a data-integrity bug, and the run should fail loudly.
    throw new Error(`Unknown report template: "${input.templateKey}"`);
  }
  const sinceDays = periodTypeToSinceDays(input.periodType);
  const scope = { projectId: input.projectId, sinceDays };
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - sinceDays * 24 * 60 * 60 * 1000);

  const [summary, volumeSeries, sentimentSeries, sourceDistribution, topStories] = await Promise.all([
    getDashboardSummary(db, organizationId, { projectId: input.projectId, sinceDays }),
    getMentionVolumeSeries(db, organizationId, scope),
    getSentimentTrendSeries(db, organizationId, scope),
    getSourceDistribution(db, organizationId, scope, 10),
    listRecentMentions(db, organizationId, { projectId: input.projectId, limit: 20 }),
  ]);

  return {
    templateKey: input.templateKey,
    projectName: input.projectName,
    periodStart,
    periodEnd,
    sinceDays,
    summary,
    volumeSeries,
    sentimentSeries,
    sourceDistribution,
    topStories,
  };
}
