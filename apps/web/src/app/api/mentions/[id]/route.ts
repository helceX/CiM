import { NextResponse } from "next/server";
import { db, getMentionDetail, type OrganizationId } from "@cim/db";
import { requireOrgContext, resolveApiKeyAuth } from "@/lib/tenant";

/**
 * The app's own Mention Detail Drawer authenticates via the session
 * cookie, same as every other route in `apps/web`; this route is also
 * the concrete proof point for SECURITY.md §83's "internal API keys"
 * (FEATURE_MATRIX.md "API keys + public API") — an `Authorization:
 * Bearer <key>` with the `mentions:read` scope reaches the exact same
 * `getMentionDetail` tenant-scoped read a session request does, no
 * separate/weaker path.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiKeyAuth = await resolveApiKeyAuth(request, "mentions:read");
  let organizationId: OrganizationId;
  if (apiKeyAuth) {
    organizationId = apiKeyAuth.organizationId;
  } else {
    try {
      organizationId = (await requireOrgContext()).organizationId;
    } catch {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
  }

  const { id } = await params;
  const detail = await getMentionDetail(db, organizationId, id);
  if (!detail) {
    return NextResponse.json({ error: "Mention not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
