import { NextResponse } from "next/server";
import { upsertBillingProfileSchema } from "@cim/validation";
import { db, getBillingProfile, recordAuditLog, upsertBillingProfile } from "@cim/db";
import { requirePermission, type OrgContext } from "@/lib/tenant";

async function authorize(): Promise<
  { context: OrgContext; response?: undefined } | { context?: undefined; response: NextResponse }
> {
  try {
    return { context: await requirePermission("org:manage_billing") };
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return {
        response: NextResponse.json(
          { error: "You don't have permission to manage billing details" },
          { status: 403 },
        ),
      };
    }
    return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
}

export async function GET() {
  const auth = await authorize();
  if (auth.response) return auth.response;
  const profile = await getBillingProfile(db, auth.context.organizationId);
  return NextResponse.json({ profile: profile ?? null });
}

export async function PUT(request: Request) {
  const auth = await authorize();
  if (auth.response) return auth.response;
  const { context } = auth;

  const parsed = upsertBillingProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const profile = await upsertBillingProfile(db, context.organizationId, parsed.data);
  // The tax number itself stays out of the audit trail; the legal name and its kind are enough.
  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "billing_profile.updated",
    targetType: "billing_profile",
    targetId: profile.id,
    metadata: { legalName: profile.legalName, taxIdKind: profile.taxIdKind },
  });
  return NextResponse.json({ ok: true, profile });
}
