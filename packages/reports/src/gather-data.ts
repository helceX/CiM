import {
  getCompetitorComparison,
  getDashboardSummary,
  getLatestInsightForOrganization,
  getMentionVolumeSeries,
  getSentimentTrendSeries,
  getSourceDistribution,
  getTopicBreakdown,
  listLatestRecommendationsForOrganization,
  listRecentMentions,
  type CompetitorComparisonRow,
  type Db,
  type DashboardSummary,
  type InsightWithEvidence,
  type InsightWithEvidenceAndProject,
  type MentionListItem,
  type MentionVolumePoint,
  type OrganizationId,
  type SentimentTrendPoint,
  type SourceDistributionRow,
  type TopicRow,
} from "@cim/db";
import { getReportTemplate, periodTypeToSinceDays, type ReportTemplateKey } from "./templates";
import type { ReportSectionKey } from "./sections";

export type ReportData = {
  templateKey: ReportTemplateKey;
  sections: ReportSectionKey[] | null;
  projectName: string;
  periodStart: Date;
  periodEnd: Date;
  sinceDays: number;
  summary: DashboardSummary;
  volumeSeries: MentionVolumePoint[];
  sentimentSeries: SentimentTrendPoint[];
  sourceDistribution: SourceDistributionRow[];
  topStories: MentionListItem[];
  topicBreakdown: TopicRow[];
  competitorComparison: CompetitorComparisonRow[];
  insight: InsightWithEvidenceAndProject | undefined;
  recommendations: InsightWithEvidence[];
};

/**
 * Reuses the same tenant-scoped analytics/mentions repositories the
 * Dashboard and Analytics screens already read (Phase 3/4) — a report is
 * a snapshot of real, already-proven data, never a parallel computation
 * that could drift from what the product shows on screen. Every field is
 * gathered regardless of template: the two fixed templates and every
 * custom section selection all draw from this one shared result, so
 * there's a single, always-correct place these queries run.
 */
export async function gatherReportData(
  db: Db,
  organizationId: OrganizationId,
  input: {
    projectId: string;
    projectName: string;
    templateKey: ReportTemplateKey;
    periodType: string;
    // The ReportRun's own periodStart/periodEnd (createReportRun, computed
    // once at enqueue time via periodTypeToRange) — reusing it here instead
    // of recomputing from `new Date()` keeps the report's displayed period
    // truthful about what was actually requested, rather than drifting to
    // whenever the worker happened to pick the job up (queue backlog,
    // retries, a restart).
    periodStart: Date;
    periodEnd: Date;
    sections?: ReportSectionKey[] | null;
  },
): Promise<ReportData> {
  if (!getReportTemplate(input.templateKey)) {
    // Never silently fall back to a default layout for an unrecognized
    // template — a Report referencing a template outside the fixed
    // registry is a data-integrity bug, and the run should fail loudly.
    throw new Error(`Unknown report template: "${input.templateKey}"`);
  }
  const sinceDays = periodTypeToSinceDays(input.periodType);
  const scope = { projectId: input.projectId, sinceDays };
  const { periodStart, periodEnd } = input;

  const [
    summary,
    volumeSeries,
    sentimentSeries,
    sourceDistribution,
    topStories,
    topicBreakdown,
    competitorComparison,
    insight,
    recommendations,
  ] = await Promise.all([
    getDashboardSummary(db, organizationId, { projectId: input.projectId, sinceDays }),
    getMentionVolumeSeries(db, organizationId, scope),
    getSentimentTrendSeries(db, organizationId, scope),
    getSourceDistribution(db, organizationId, scope, 10),
    listRecentMentions(db, organizationId, { projectId: input.projectId, limit: 20, sinceDays }),
    getTopicBreakdown(db, organizationId, scope),
    getCompetitorComparison(db, organizationId, { sinceDays, projectId: input.projectId }),
    getLatestInsightForOrganization(db, organizationId, "whats_changed", { projectId: input.projectId }),
    listLatestRecommendationsForOrganization(db, organizationId, { projectId: input.projectId }),
  ]);

  return {
    templateKey: input.templateKey,
    sections: input.sections ?? null,
    projectName: input.projectName,
    periodStart,
    periodEnd,
    sinceDays,
    summary,
    volumeSeries,
    sentimentSeries,
    sourceDistribution,
    topStories,
    topicBreakdown,
    competitorComparison,
    insight,
    recommendations,
  };
}
