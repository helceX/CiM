import type { Db } from "../client";
import { auditLogs } from "../schema/audit";
import type { OrganizationId } from "./tenant-scope";

export async function recordAuditLog(
  db: Db,
  organizationId: OrganizationId,
  entry: {
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(auditLogs).values({
    organizationId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata,
  });
}
