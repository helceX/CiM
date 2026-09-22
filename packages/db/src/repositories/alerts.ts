import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { alertEvents, alertRules } from "../schema/alerts";
import { monitoringQueries } from "../schema/monitoring";
import { organizations } from "../schema/organizations";
import type { OrganizationId } from "./tenant-scope";

export type AlertRuleType =
  | "keyword"
  | "high_relevance"
  | "spike"
  | "sentiment_shift"
  | "emerging_topic";
export type AlertChannel = "in_app" | "email" | "webhook";

export async function createAlertRule(
  db: Db,
  organizationId: OrganizationId,
  input: {
    projectId: string;
    queryId: string;
    createdByUserId: string;
    name: string;
    type: AlertRuleType;
    channels: AlertChannel[];
    cooldownMinutes?: number;
  },
) {
  const [rule] = await db
    .insert(alertRules)
    .values({
      organizationId,
      projectId: input.projectId,
      queryId: input.queryId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      type: input.type,
      channels: input.channels,
      cooldownMinutes: input.cooldownMinutes ?? 60,
    })
    .returning();
  if (!rule) throw new Error("Failed to create alert rule");
  return rule;
}

export async function listAlertRules(db: Db, organizationId: OrganizationId) {
  return db
    .select({ rule: alertRules, queryName: monitoringQueries.name })
    .from(alertRules)
    .innerJoin(monitoringQueries, eq(monitoringQueries.id, alertRules.queryId))
    .where(eq(alertRules.organizationId, organizationId))
    .orderBy(desc(alertRules.createdAt));
}

/** Called right after the ingestion pipeline creates mentions for a query. */
export async function getActiveAlertRulesForQuery(
  db: Db,
  queryId: string,
  type?: AlertRuleType,
) {
  return db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.queryId, queryId),
        eq(alertRules.status, "active"),
        type ? eq(alertRules.type, type) : undefined,
      ),
    );
}

/**
 * The scheduler-tick counterpart to
 * listActiveMonitoringQueriesForSourceType — scheduler-driven alert types
 * (spike, sentiment_shift) run per-tick across every organization's
 * active rules of that type, the same documented cross-tenant exception
 * (ADR-001) ingestion already relies on.
 */
async function getActiveAlertRulesOfType(db: Db, type: AlertRuleType) {
  return (
    db
      .select({
        id: alertRules.id,
        organizationId: alertRules.organizationId,
        projectId: alertRules.projectId,
        queryId: alertRules.queryId,
        createdByUserId: alertRules.createdByUserId,
        name: alertRules.name,
        type: alertRules.type,
        channels: alertRules.channels,
        cooldownMinutes: alertRules.cooldownMinutes,
        status: alertRules.status,
        createdAt: alertRules.createdAt,
        updatedAt: alertRules.updatedAt,
      })
      .from(alertRules)
      // A soft-deleted organization must stop firing alerts — see the same
      // note in listActiveMonitoringQueriesForSourceType.
      .innerJoin(organizations, eq(organizations.id, alertRules.organizationId))
      .where(
        and(
          eq(alertRules.status, "active"),
          eq(alertRules.type, type),
          isNull(organizations.deletedAt),
        ),
      )
  );
}

export function getActiveSpikeAlertRules(db: Db) {
  return getActiveAlertRulesOfType(db, "spike");
}

export function getActiveSentimentShiftAlertRules(db: Db) {
  return getActiveAlertRulesOfType(db, "sentiment_shift");
}

export function getActiveEmergingTopicAlertRules(db: Db) {
  return getActiveAlertRulesOfType(db, "emerging_topic");
}

/** Alert fatigue (brief §19–20): suppress re-notifying within the rule's cooldown window. */
export async function findRecentAlertEvent(
  db: Db,
  alertRuleId: string,
  cooldownMinutes: number,
) {
  const [event] = await db
    .select()
    .from(alertEvents)
    .where(
      and(
        eq(alertEvents.alertRuleId, alertRuleId),
        gt(
          alertEvents.createdAt,
          sql`now() - (${cooldownMinutes}::text || ' minutes')::interval`,
        ),
      ),
    )
    .limit(1);
  return event;
}

export async function createAlertEvent(
  db: Db,
  organizationId: OrganizationId,
  input: { alertRuleId: string; triggerSummary: string; mentionIds: string[] },
) {
  const [event] = await db
    .insert(alertEvents)
    .values({
      organizationId,
      alertRuleId: input.alertRuleId,
      triggerSummary: input.triggerSummary,
      mentionIds: input.mentionIds,
    })
    .returning();
  if (!event) throw new Error("Failed to create alert event");
  return event;
}

export async function listAlertEventsForRule(db: Db, alertRuleId: string, limit = 20) {
  return db
    .select()
    .from(alertEvents)
    .where(eq(alertEvents.alertRuleId, alertRuleId))
    .orderBy(alertEvents.createdAt)
    .limit(limit);
}
