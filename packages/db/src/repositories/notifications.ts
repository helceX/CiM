import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../client";
import { notifications } from "../schema/alerts";
import { organizationMemberships } from "../schema/organizations";
import type { OrganizationId } from "./tenant-scope";

/**
 * One Notification row per active org member (brief §20 — Notification
 * Center is per-user, not a shared org inbox). MVP fan-out: everyone in
 * the organization; targeting by role/preference is a later increment.
 */
export async function createNotificationForOrgMembers(
  db: Db,
  organizationId: OrganizationId,
  input: {
    kind: "alert" | "system" | "report";
    title: string;
    body: string;
    relatedAlertEventId?: string;
  },
) {
  const members = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, "active"),
      ),
    );
  if (members.length === 0) return [];

  return db
    .insert(notifications)
    .values(
      members.map((member) => ({
        organizationId,
        userId: member.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        relatedAlertEventId: input.relatedAlertEventId,
      })),
    )
    .returning();
}

/** Single-recipient notification — for events scoped to the user who requested them (a report run), not a whole-org fan-out. */
export async function createNotificationForUser(
  db: Db,
  organizationId: OrganizationId,
  userId: string,
  input: { kind: "alert" | "system" | "report"; title: string; body: string },
) {
  const [row] = await db
    .insert(notifications)
    .values({ organizationId, userId, kind: input.kind, title: input.title, body: input.body })
    .returning();
  return row;
}

export async function listNotifications(
  db: Db,
  organizationId: OrganizationId,
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.userId, userId),
        isNull(notifications.archivedAt),
        options.unreadOnly ? isNull(notifications.readAt) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(options.limit ?? 20);
}

export async function countUnreadNotifications(
  db: Db,
  organizationId: OrganizationId,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function markNotificationRead(
  db: Db,
  organizationId: OrganizationId,
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.userId, userId),
        eq(notifications.id, notificationId),
      ),
    )
    .returning({ id: notifications.id });
  return result.length > 0;
}

export async function markAllNotificationsRead(
  db: Db,
  organizationId: OrganizationId,
  userId: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.organizationId, organizationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
}
