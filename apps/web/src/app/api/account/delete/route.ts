import { NextResponse } from "next/server";
import { deleteAccountSchema } from "@cim/validation";
import { verifyPassword } from "@cim/core";
import {
  anonymizeUser,
  db,
  findUserById,
  listMembershipOrganizationIdsForAudit,
  listSoleOwnedOrganizations,
  recordAuditLog,
  revokeAllSessionsForUser,
} from "@cim/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { destroyCurrentSession, getCurrentUser } from "@/lib/session";

/**
 * docs/architecture/SECURITY.md "Supported from MVP: ... account deletion
 * ... audit trail of these actions." Deletion is anonymization (see
 * packages/db privacy.ts), password-reconfirmed, and blocked while the
 * user is the sole active owner of any still-existing organization —
 * deleting them would otherwise leave that org ownerless with no recovery
 * path (ownership transfer isn't built yet).
 */
export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(`account-delete:${currentUser.id}`, {
    limit: 5,
    windowSeconds: 15 * 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = deleteAccountSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const user = await findUserById(db, currentUser.id);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const passwordOk = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const blockingOrgs = await listSoleOwnedOrganizations(db, user.id);
  if (blockingOrgs.length > 0) {
    return NextResponse.json(
      {
        error:
          "You're the only owner of one or more organizations. Add another owner or delete the organization first.",
        code: "SOLE_OWNER",
        organizations: blockingOrgs.map((org) => org.organizationName),
      },
      { status: 409 },
    );
  }

  const organizationIds = await listMembershipOrganizationIdsForAudit(db, user.id);
  for (const organizationId of organizationIds) {
    await recordAuditLog(db, organizationId, {
      actorUserId: user.id,
      action: "account.deleted",
      targetType: "user",
      targetId: user.id,
    });
  }

  await anonymizeUser(db, user.id);
  await revokeAllSessionsForUser(db, user.id);
  await destroyCurrentSession();

  return NextResponse.json({ ok: true });
}
