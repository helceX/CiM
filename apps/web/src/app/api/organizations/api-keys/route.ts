import { NextResponse } from "next/server";
import { createApiKeySchema } from "@cim/validation";
import { createApiKey, db, listApiKeys, recordAuditLog } from "@cim/db";
import { requirePermission } from "@/lib/tenant";

export async function GET() {
  let context;
  try {
    context = await requirePermission("api_keys:manage");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Only an owner or admin can manage API keys" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const keys = await listApiKeys(db, context.organizationId);
  return NextResponse.json(keys);
}

export async function POST(request: Request) {
  let context;
  try {
    context = await requirePermission("api_keys:manage");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "Only an owner or admin can manage API keys" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = createApiKeySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // packages/validation/src/api-keys.ts's schema only checks that each
  // requested scope is a real Permission, not that *this user's own
  // role* actually holds it — without this, a role granted nothing but
  // api_keys:manage could mint a key scoped to org:manage_billing or any
  // other permission it doesn't itself have (privilege escalation).
  const disallowedScopes = parsed.data.scopes.filter(
    (scope) => !context.permissions.includes(scope),
  );
  if (disallowedScopes.length > 0) {
    return NextResponse.json(
      { error: `You can't grant scopes you don't have: ${disallowedScopes.join(", ")}` },
      { status: 403 },
    );
  }

  const { rawKey, summary } = await createApiKey(db, context.organizationId, {
    name: parsed.data.name,
    scopes: parsed.data.scopes,
    createdByUserId: context.userId,
  });

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "api_key.created",
    targetType: "api_key",
    targetId: summary.id,
    metadata: { name: summary.name, scopes: summary.scopes },
  });

  // The only response that will ever contain the raw key — never
  // returned again by GET (docs/architecture/SECURITY.md §83).
  return NextResponse.json({ rawKey, ...summary }, { status: 201 });
}
