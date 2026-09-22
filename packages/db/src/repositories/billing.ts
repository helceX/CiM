import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { featureUsageSnapshots, subscriptions } from "../schema/billing";
import { organizationMemberships, organizations } from "../schema/organizations";
import { monitoringQueries } from "../schema/monitoring";
import { articles, mentions } from "../schema/content";
import { reports } from "../schema/reports";
import { asOrganizationId, type OrganizationId } from "./tenant-scope";

export type Subscription = { plan: string };
const DEFAULT_SUBSCRIPTION: Subscription = { plan: "free" };

/** No row means "free" — same lazy-default convention as `getRetentionPolicy`. */
export async function getSubscription(db: Db, organizationId: OrganizationId): Promise<Subscription> {
  const [row] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  return row ?? DEFAULT_SUBSCRIPTION;
}

export type OrgRef = { organizationId: OrganizationId };

/**
 * Cross-tenant fan-out target for the worker's capture_feature_usage job
 * (the same documented cross-tenant read exception ADR-001 already grants
 * the digest/retention/scheduled-report jobs) — every organization that
 * hasn't been soft-deleted.
 */
export async function listActiveOrganizationsForUsageCapture(db: Db): Promise<OrgRef[]> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNull(organizations.deletedAt));
  return rows.map((row) => ({ organizationId: asOrganizationId(row.id) }));
}

/**
 * Every count is a fresh `COUNT(*)` against the source tables, not an
 * incrementing counter touched at each usage site (see billing.ts's
 * schema comment) — so this is the one place usage numbers are computed,
 * never duplicated logic scattered across every mutation that happens to
 * affect one.
 */
export async function captureFeatureUsageSnapshot(db: Db, organizationId: OrganizationId): Promise<void> {
  const [keywordsRow] = await db
    .select({ value: count() })
    .from(monitoringQueries)
    .where(
      and(
        eq(monitoringQueries.organizationId, organizationId),
        eq(monitoringQueries.status, "active"),
        isNull(monitoringQueries.deletedAt),
      ),
    );
  const [sourcesRow] = await db
    .select({ value: sql<number>`count(distinct ${articles.sourceId})` })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .where(eq(mentions.organizationId, organizationId));
  const [mentionsRow] = await db
    .select({ value: count() })
    .from(mentions)
    .where(eq(mentions.organizationId, organizationId));
  const [aiCreditsRow] = await db
    .select({ value: count() })
    .from(mentions)
    .where(and(eq(mentions.organizationId, organizationId), eq(mentions.aiStatus, "completed")));
  const [reportsRow] = await db
    .select({ value: count() })
    .from(reports)
    .where(eq(reports.organizationId, organizationId));
  const [usersRow] = await db
    .select({ value: count() })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, "active"),
      ),
    );

  await db.insert(featureUsageSnapshots).values({
    organizationId,
    keywordsCount: Number(keywordsRow?.value ?? 0),
    sourcesCount: Number(sourcesRow?.value ?? 0),
    mentionsCount: Number(mentionsRow?.value ?? 0),
    aiCreditsCount: Number(aiCreditsRow?.value ?? 0),
    reportsCount: Number(reportsRow?.value ?? 0),
    usersCount: Number(usersRow?.value ?? 0),
  });
}

export type FeatureUsageSnapshot = {
  capturedAt: Date;
  keywordsCount: number;
  sourcesCount: number;
  mentionsCount: number;
  aiCreditsCount: number;
  reportsCount: number;
  usersCount: number;
};

/** `undefined` (never a fabricated zero row) until the daily job has captured at least once. */
export async function getLatestFeatureUsage(
  db: Db,
  organizationId: OrganizationId,
): Promise<FeatureUsageSnapshot | undefined> {
  const [row] = await db
    .select({
      capturedAt: featureUsageSnapshots.capturedAt,
      keywordsCount: featureUsageSnapshots.keywordsCount,
      sourcesCount: featureUsageSnapshots.sourcesCount,
      mentionsCount: featureUsageSnapshots.mentionsCount,
      aiCreditsCount: featureUsageSnapshots.aiCreditsCount,
      reportsCount: featureUsageSnapshots.reportsCount,
      usersCount: featureUsageSnapshots.usersCount,
    })
    .from(featureUsageSnapshots)
    .where(eq(featureUsageSnapshots.organizationId, organizationId))
    .orderBy(desc(featureUsageSnapshots.capturedAt))
    .limit(1);
  return row;
}
