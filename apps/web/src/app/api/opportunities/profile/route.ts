import { NextResponse } from "next/server";
import { z } from "zod";
import {
  db,
  getOpportunityProfile,
  recordAuditLog,
  saveOpportunityProfile,
} from "@cim/db";
import { requirePermission } from "@/lib/tenant";

const terms = z
  .array(z.string().trim().min(1).max(80))
  .max(30)
  .transform((items) => [...new Set(items)]);
const profileSchema = z.object({
  organizationType: z.enum([
    "company",
    "nonprofit",
    "university",
    "public",
    "cooperative",
    "other",
  ]),
  sector: z.string().trim().max(120).default(""),
  startupStage: z.string().trim().max(80).default(""),
  operatingRegions: terms,
  sectors: terms,
  technologies: terms,
  themes: terms,
  opportunityTypes: terms,
  eligibilityConstraints: terms,
  languages: z
    .array(z.enum(["tr", "en", "other"]))
    .max(5)
    .default(["tr"]),
});

export async function GET() {
  let context;
  try {
    context = await requirePermission("mentions:read");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === "FORBIDDEN"
            ? "Forbidden"
            : "Not authenticated",
      },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }
  return NextResponse.json({
    profile: await getOpportunityProfile(db, context.organizationId),
  });
}

export async function PUT(request: Request) {
  let context;
  try {
    context = await requirePermission("mentions:write");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === "FORBIDDEN"
            ? "Forbidden"
            : "Not authenticated",
      },
      { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid profile", issues: parsed.error.issues },
      { status: 400 },
    );

  const profile = await saveOpportunityProfile(db, context.organizationId, parsed.data);
  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "opportunity.profile_updated",
    targetType: "opportunity_profile",
    targetId: profile.id,
    metadata: {
      themeCount: profile.themes.length,
      regionCount: profile.operatingRegions.length,
    },
  });
  return NextResponse.json({ profile });
}
