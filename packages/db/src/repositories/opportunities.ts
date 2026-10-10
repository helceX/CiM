import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  explainOpportunityMatch,
  type OpportunityMatch,
  type SignalReason,
} from "@cim/core";
import type { Db } from "../client";
import { articles, mentions, sources } from "../schema/content";
import {
  opportunityFollowups,
  opportunityProfiles,
  type OpportunityProfile,
} from "../schema/opportunities";
import { monitoringQueries } from "../schema/monitoring";
import { users } from "../schema/users";
import { organizationMemberships } from "../schema/organizations";
import type { OrganizationId } from "./tenant-scope";

export type OpportunityProfileInput = Pick<
  OpportunityProfile,
  | "organizationType"
  | "sector"
  | "startupStage"
  | "operatingRegions"
  | "sectors"
  | "technologies"
  | "themes"
  | "opportunityTypes"
  | "eligibilityConstraints"
  | "languages"
>;

export async function getOpportunityProfile(db: Db, organizationId: OrganizationId) {
  const [profile] = await db
    .select()
    .from(opportunityProfiles)
    .where(eq(opportunityProfiles.organizationId, organizationId))
    .limit(1);
  return profile ?? null;
}

export async function saveOpportunityProfile(
  db: Db,
  organizationId: OrganizationId,
  input: OpportunityProfileInput,
) {
  const now = new Date();
  const [profile] = await db
    .insert(opportunityProfiles)
    .values({ organizationId, ...input, updatedAt: now })
    .onConflictDoUpdate({
      target: opportunityProfiles.organizationId,
      set: { ...input, updatedAt: now },
    })
    .returning();
  if (!profile) throw new Error("failed to save opportunity profile");
  return profile;
}

export async function deleteOpportunityProfile(
  db: Db,
  organizationId: OrganizationId,
): Promise<boolean> {
  const rows = await db
    .delete(opportunityProfiles)
    .where(eq(opportunityProfiles.organizationId, organizationId))
    .returning({ id: opportunityProfiles.id });
  return rows.length > 0;
}

export async function listOpportunityCandidates(
  db: Db,
  organizationId: OrganizationId,
  limit = 100,
) {
  const [profile] = await db
    .select()
    .from(opportunityProfiles)
    .where(eq(opportunityProfiles.organizationId, organizationId))
    .limit(1);
  if (!profile) return [];
  const rows = await db
    .select({
      mention: mentions,
      article: articles,
      source: sources,
      queryName: monitoringQueries.name,
      assigneeName: sql<
        string | null
      >`case when ${opportunityFollowups.assignedToUserId} is null then null else ${users.firstName} || ' ' || ${users.lastName} end`,
      followup: opportunityFollowups,
    })
    .from(mentions)
    .innerJoin(articles, eq(articles.id, mentions.articleId))
    .innerJoin(sources, eq(sources.id, articles.sourceId))
    .innerJoin(monitoringQueries, eq(monitoringQueries.id, mentions.queryId))
    .leftJoin(
      opportunityFollowups,
      and(
        eq(opportunityFollowups.organizationId, organizationId),
        eq(opportunityFollowups.mentionId, mentions.id),
      ),
    )
    .leftJoin(users, eq(users.id, opportunityFollowups.assignedToUserId))
    .where(
      and(
        eq(mentions.organizationId, organizationId),
        eq(monitoringQueries.status, "active"),
        sql`${mentions.status} <> 'archived'`,
        sql`${mentions.signalReasons} @> '[{"code":"goal","goal":"opportunity"}]'::jsonb`,
        ...(profile.languages.length
          ? [
              or(
                isNull(articles.language),
                inArray(articles.language, profile.languages),
              )!,
            ]
          : []),
      ),
    )
    .orderBy(desc(mentions.signalScore), desc(mentions.createdAt))
    .limit(Math.max(1, Math.min(limit, 250)));

  return rows.map((row) => {
    const match: OpportunityMatch = explainOpportunityMatch({
      themes: [
        ...(profile?.sector ? [profile.sector] : []),
        ...(profile?.themes ?? []),
        ...(profile?.sectors ?? []),
        ...(profile?.technologies ?? []),
        ...(profile?.opportunityTypes ?? []),
      ],
      title: row.article.title,
      excerpt: row.article.storedExcerpt,
      language: row.article.language,
      organizationType: profile?.organizationType,
      regions: profile?.operatingRegions,
      constraints: profile?.eligibilityConstraints,
    });
    const opportunitySignalReasons = (row.mention.signalReasons ?? []).filter(
      (reason): reason is Extract<SignalReason, { code: "goal" }> =>
        reason.code === "goal" && reason.goal === "opportunity",
    );
    return { ...row, opportunitySignalReasons, match };
  });
}

export type OpportunityFollowupInput = {
  status:
    | "new"
    | "reviewing"
    | "possibly_eligible"
    | "not_eligible"
    | "planning"
    | "preparing"
    | "submitted"
    | "won"
    | "pending_outcome"
    | "not_awarded"
    | "archived";
  assignedToUserId: string | null;
  note: string;
  dueAt: Date | null;
  sourceVerified: boolean;
  updatedByUserId: string;
};

export async function saveOpportunityFollowup(
  db: Db,
  organizationId: OrganizationId,
  mentionId: string,
  input: OpportunityFollowupInput,
) {
  const [mention] = await db
    .select({ id: mentions.id, projectId: mentions.projectId })
    .from(mentions)
    .innerJoin(monitoringQueries, eq(monitoringQueries.id, mentions.queryId))
    .where(
      and(
        eq(mentions.id, mentionId),
        eq(mentions.organizationId, organizationId),
        eq(monitoringQueries.status, "active"),
        sql`${mentions.status} <> 'archived'`,
        sql`${mentions.signalReasons} @> '[{"code":"goal","goal":"opportunity"}]'::jsonb`,
      ),
    )
    .limit(1);
  if (!mention) return null;

  if (input.assignedToUserId) {
    const [membership] = await db
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, organizationId),
          eq(organizationMemberships.userId, input.assignedToUserId),
          eq(organizationMemberships.status, "active"),
        ),
      )
      .limit(1);
    if (!membership) return null;
  }

  const now = new Date();
  const values = {
    organizationId,
    mentionId,
    status: input.status,
    assignedToUserId: input.assignedToUserId,
    note: input.note,
    dueAt: input.dueAt,
    sourceVerifiedAt: input.sourceVerified ? now : null,
    updatedByUserId: input.updatedByUserId,
    updatedAt: now,
  };
  const [followup] = await db
    .insert(opportunityFollowups)
    .values(values)
    .onConflictDoUpdate({
      target: [opportunityFollowups.organizationId, opportunityFollowups.mentionId],
      set: values,
    })
    .returning();
  return followup ?? null;
}
