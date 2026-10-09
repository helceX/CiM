import {
  db,
  getOpportunityProfile,
  listMembersForOrganization,
  listOpportunityCandidates,
} from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";
import { OpportunitiesClient } from "./opportunities-client";

export default async function OpportunitiesPage() {
  const context = await requireOrgContext();
  const [profile, candidates, members] = await Promise.all([
    getOpportunityProfile(db, context.organizationId),
    listOpportunityCandidates(db, context.organizationId),
    listMembersForOrganization(db, context.organizationId),
  ]);

  return (
    <OpportunitiesClient
      profile={
        profile
          ? {
              organizationType: profile.organizationType,
              sector: profile.sector,
              startupStage: profile.startupStage,
              operatingRegions: profile.operatingRegions,
              sectors: profile.sectors,
              technologies: profile.technologies,
              themes: profile.themes,
              opportunityTypes: profile.opportunityTypes,
              eligibilityConstraints: profile.eligibilityConstraints,
              languages: profile.languages,
            }
          : null
      }
      canWrite={context.permissions.includes("mentions:write")}
      members={members
        .filter((member) => member.status === "active")
        .map(({ userId, firstName, lastName }) => ({
          userId,
          name: `${firstName} ${lastName}`.trim(),
        }))}
      candidates={candidates.map(
        ({ mention, article, source, match, followup, assigneeName }) => ({
          mentionId: mention.id,
          title: article.title,
          url: article.canonicalUrl,
          excerpt: article.storedExcerpt,
          sourceName: source.name,
          sourceDomain: source.domain,
          publishedAt: article.publishedAt?.toISOString() ?? null,
          observedAt: mention.createdAt.toISOString(),
          match,
          followup: followup?.id
            ? {
                status: followup.status,
                assignedToUserId: followup.assignedToUserId,
                note: followup.note,
                dueAt: followup.dueAt?.toISOString() ?? null,
                sourceVerified: Boolean(followup.sourceVerifiedAt),
                assigneeName,
              }
            : null,
        }),
      )}
    />
  );
}
