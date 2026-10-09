import { afterAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "../client";
import { articles, sources } from "../schema/content";
import { organizations, workspaces } from "../schema/organizations";
import { users } from "../schema/users";
import { createMentionIfNotExists } from "./mentions";
import { createMonitoringQuery } from "./monitoring-queries";
import { createProject } from "./projects";
import { asOrganizationId } from "./tenant-scope";
import {
  listOpportunityCandidates,
  saveOpportunityFollowup,
  saveOpportunityProfile,
} from "./opportunities";
import { scoreUnscoredMentions } from "./signals";

const tag = `opportunity-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let sourceId: string | null = null;
let actorUserId: string | null = null;

async function makeOrg(label: string) {
  const [row] = await db
    .insert(organizations)
    .values({ name: `${label} Org`, slug: `${tag}-${label}` })
    .returning();
  const organizationId = asOrganizationId(row!.id);
  const [workspace] = await db
    .insert(workspaces)
    .values({ organizationId, name: "Workspace" })
    .returning();
  const project = await createProject(db, organizationId, {
    workspaceId: workspace!.id,
    name: "Project",
  });
  const query = await createMonitoringQuery(db, organizationId, {
    projectId: project.id,
    name: "Opportunity watch",
    queryAst: {
      include: ["grant"],
      exclude: [],
      exactPhrases: [],
      intent: { goals: ["opportunity"], focus: "balanced", signalWords: [] },
    },
    booleanQuery: "grant",
    sourceTypes: ["news"],
    trackingTarget: "company",
  });
  return { organizationId, projectId: project.id, queryId: query.id };
}

describe("opportunity profile and follow-up (integration)", () => {
  afterAll(async () => {
    await db.delete(organizations).where(like(organizations.slug, `${tag}-%`));
    if (sourceId)
      await db.delete(sources).where(like(sources.domain, `${tag}.example`));
    if (actorUserId)
      await db.delete(users).where(like(users.email, `${tag}@example.com`));
  });

  it("keeps profiles, candidate signals, and follow-ups within one organization", async () => {
    const mine = await makeOrg("mine");
    const other = await makeOrg("other");
    const [actor] = await db
      .insert(users)
      .values({
        email: `${tag}@example.com`,
        passwordHash: "x",
        firstName: "Opportunity",
        lastName: "Tester",
      })
      .returning({ id: users.id });
    actorUserId = actor!.id;
    const [source] = await db
      .insert(sources)
      .values({
        name: `${tag} source`,
        domain: `${tag}.example`,
        type: "news",
        connector: "mock",
        status: "healthy",
      })
      .returning();
    sourceId = source!.id;
    const [article] = await db
      .insert(articles)
      .values({
        sourceId: source!.id,
        canonicalUrl: `https://${tag}.example/grant`,
        contentHash: `${tag}-hash`,
        title: "Grant programme opens",
        language: "en",
        publishedAt: new Date(),
      })
      .returning();
    const mineMention = await createMentionIfNotExists(db, mine.organizationId, {
      projectId: mine.projectId,
      queryId: mine.queryId,
      articleId: article!.id,
      matchedTerms: ["grant"],
    });
    const otherMention = await createMentionIfNotExists(db, other.organizationId, {
      projectId: other.projectId,
      queryId: other.queryId,
      articleId: article!.id,
      matchedTerms: ["grant"],
    });
    await scoreUnscoredMentions(db, { queryId: mine.queryId });
    await scoreUnscoredMentions(db, { queryId: other.queryId });

    await saveOpportunityProfile(db, mine.organizationId, {
      organizationType: "company",
      sector: "",
      startupStage: "",
      operatingRegions: ["TR"],
      sectors: [],
      technologies: [],
      themes: ["grant"],
      opportunityTypes: [],
      eligibilityConstraints: ["SME"],
      languages: ["en"],
    });
    await saveOpportunityProfile(db, other.organizationId, {
      organizationType: "nonprofit",
      sector: "",
      startupStage: "",
      operatingRegions: [],
      sectors: [],
      technologies: [],
      themes: ["climate"],
      opportunityTypes: [],
      eligibilityConstraints: [],
      languages: ["en"],
    });

    const mineCandidates = await listOpportunityCandidates(db, mine.organizationId);
    const otherCandidates = await listOpportunityCandidates(db, other.organizationId);
    expect(mineCandidates.map((row) => row.mention.id)).toContain(mineMention);
    expect(mineCandidates.map((row) => row.mention.id)).not.toContain(otherMention);
    expect(
      mineCandidates.find((row) => row.mention.id === mineMention)?.match.matchedThemes,
    ).toEqual(["grant"]);
    expect(
      otherCandidates.find((row) => row.mention.id === otherMention)?.match
        .matchedThemes,
    ).toEqual([]);

    expect(
      await saveOpportunityFollowup(db, mine.organizationId, otherMention!, {
        status: "reviewing",
        assignedToUserId: null,
        note: "cross tenant",
        dueAt: null,
        sourceVerified: false,
        updatedByUserId: actorUserId!,
      }),
    ).toBeNull();
    const saved = await saveOpportunityFollowup(db, mine.organizationId, mineMention!, {
      status: "reviewing",
      assignedToUserId: null,
      note: "Check the official publisher page",
      dueAt: null,
      sourceVerified: false,
      updatedByUserId: actorUserId!,
    });
    expect(saved).toMatchObject({
      organizationId: mine.organizationId,
      mentionId: mineMention,
      status: "reviewing",
    });
  });
});
