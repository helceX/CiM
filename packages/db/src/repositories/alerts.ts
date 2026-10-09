import { and, desc, eq, getTableColumns, gt, inArray, isNull, sql } from "drizzle-orm";
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
  | "emerging_topic"
  | "competitor"
  | "creator_spike";
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

/** How a person wants to hear about a monitoring: not at all, only important stories, or every new story. */
export type NotifyMode = "none" | "important" | "every";

/**
 * The alert rule behind the answer to "how should we tell you?" when a monitoring is saved (and during
 * onboarding): "important" is a high-relevance rule, "every" a keyword rule. In-app always, e-mail when
 * asked. Returns null for "none". One rule per answer — it shows up in Alerts like any other rule and can
 * be changed or paused there.
 */
export async function createNotifyRuleForQuery(
  db: Db,
  organizationId: OrganizationId,
  input: {
    projectId: string;
    queryId: string;
    createdByUserId: string;
    monitoringName: string;
    mode: NotifyMode;
    email?: boolean;
  },
) {
  if (input.mode === "none") return null;
  return createAlertRule(db, organizationId, {
    projectId: input.projectId,
    queryId: input.queryId,
    createdByUserId: input.createdByUserId,
    name: `${input.mode === "important" ? "Important stories" : "Every new story"} — ${input.monitoringName}`.slice(0, 160),
    type: input.mode === "important" ? "high_relevance" : "keyword",
    channels: input.email ? ["in_app", "email"] : ["in_app"],
    cooldownMinutes: 60,
  });
}

export async function listAlertRules(db: Db, organizationId: OrganizationId) {
  return db
    .select({ rule: alertRules, queryName: monitoringQueries.name })
    .from(alertRules)
    .innerJoin(monitoringQueries, eq(monitoringQueries.id, alertRules.queryId))
    .where(eq(alertRules.organizationId, organizationId))
    .orderBy(desc(alertRules.createdAt));
}

/**
 * Called right after the ingestion pipeline creates mentions for a query.
 * A soft-deleted organization must stop firing alerts — same invariant
 * getActiveAlertRulesOfType below already enforces for the scheduler-
 * driven alert types; this immediate-trigger path was missing it.
 */
export async function getActiveAlertRulesForQuery(
  db: Db,
  queryId: string,
  type?: AlertRuleType,
) {
  return db
    .select(getTableColumns(alertRules))
    .from(alertRules)
    .innerJoin(organizations, eq(organizations.id, alertRules.organizationId))
    .where(
      and(
        eq(alertRules.queryId, queryId),
        eq(alertRules.status, "active"),
        type ? eq(alertRules.type, type) : undefined,
        isNull(organizations.deletedAt),
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

export function getActiveCompetitorAlertRules(db: Db) {
  return getActiveAlertRulesOfType(db, "competitor");
}

export function getActiveCreatorSpikeAlertRules(db: Db) {
  return getActiveAlertRulesOfType(db, "creator_spike");
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

/**
 * Which of these rules are inside their cooldown right now (an event newer than the rule's own cooldown). A read-only
 * shortcut for the evaluators, so a rule that cannot fire is not evaluated; the authoritative, locked check stays in
 * createAlertEventIfNotInCooldown. Uses alert_events_rule_created_idx.
 */
export async function listRuleIdsInCooldown(db: Db, alertRuleIds: string[]): Promise<Set<string>> {
  if (alertRuleIds.length === 0) return new Set();
  const rows = await db
    .select({ id: alertRules.id })
    .from(alertRules)
    .where(
      and(
        inArray(alertRules.id, alertRuleIds),
        sql`exists (
          select 1 from ${alertEvents}
          where ${alertEvents.alertRuleId} = ${alertRules.id}
            and ${alertEvents.createdAt} > now() - (${alertRules.cooldownMinutes}::text || ' minutes')::interval
        )`,
      ),
    );
  return new Set(rows.map((row) => row.id));
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

/**
 * findRecentAlertEvent + createAlertEvent, atomically — plain
 * check-then-act (fireAlert's own previous sequence) is a race the same
 * shape as createMonitoringQueryWithPlanLimit's own documented one
 * (billing.ts): apps/worker/src/index.ts runs crawl_source jobs at
 * concurrency 5, and crawl-scheduler.ts fans out one job per active
 * source every tick, so two different sources matching the same
 * monitoring query in the same tick each call fireAlert independently.
 * Both can read "no recent event" before either INSERT commits, firing
 * duplicate email/in_app/webhook notifications for what the rule's
 * cooldown (alert fatigue, brief §19–20) exists to collapse into one. A
 * Postgres advisory lock scoped to the rule id serializes concurrent
 * callers for the duration of the check + insert.
 */
export async function createAlertEventIfNotInCooldown(
  db: Db,
  organizationId: OrganizationId,
  rule: { id: string; cooldownMinutes: number },
  input: { triggerSummary: string; mentionIds: string[] },
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${rule.id}))`);

    const txDb = tx as unknown as Db;
    const inCooldown = await findRecentAlertEvent(txDb, rule.id, rule.cooldownMinutes);
    if (inCooldown) return null;

    return createAlertEvent(txDb, organizationId, {
      alertRuleId: rule.id,
      triggerSummary: input.triggerSummary,
      mentionIds: input.mentionIds,
    });
  });
}

export async function listAlertEventsForRule(db: Db, alertRuleId: string, limit = 20) {
  return db
    .select()
    .from(alertEvents)
    .where(eq(alertEvents.alertRuleId, alertRuleId))
    .orderBy(desc(alertEvents.createdAt))
    .limit(limit);
}
