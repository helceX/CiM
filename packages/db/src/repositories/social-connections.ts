import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "../client";
import { socialConnectionEvents, socialConnections, type SocialConnectionEvent } from "../schema/social-connections";
import type { OrganizationId } from "./tenant-scope";

/** What a browser may see of a connection — never a token. */
export type PublicSocialConnection = {
  id: string;
  platform: string;
  handle: string;
  displayName: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  status: string;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};

const publicColumns = {
  id: socialConnections.id,
  platform: socialConnections.platform,
  handle: socialConnections.handle,
  displayName: socialConnections.displayName,
  profileUrl: socialConnections.profileUrl,
  avatarUrl: socialConnections.avatarUrl,
  status: socialConnections.status,
  lastSyncAt: socialConnections.lastSyncAt,
  lastError: socialConnections.lastError,
  createdAt: socialConnections.createdAt,
};

export async function listSocialConnections(db: Db, organizationId: OrganizationId): Promise<PublicSocialConnection[]> {
  return db
    .select(publicColumns)
    .from(socialConnections)
    .where(eq(socialConnections.organizationId, organizationId))
    .orderBy(socialConnections.createdAt, socialConnections.id);
}

export type SaveSocialConnectionInput = {
  platform: string;
  externalAccountId: string;
  handle: string;
  displayName?: string | null;
  profileUrl?: string | null;
  avatarUrl?: string | null;
  accessTokenEnc: string;
  refreshTokenEnc?: string | null;
  scopes: string;
  tokenExpiresAt?: Date | null;
  connectedByUserId: string;
};

/**
 * Connecting the same account again (e.g. to renew a revoked grant) replaces its
 * tokens and clears the error — it never creates a second row.
 */
export async function saveSocialConnection(db: Db, organizationId: OrganizationId, input: SaveSocialConnectionInput) {
  const values = {
    handle: input.handle,
    displayName: input.displayName ?? null,
    profileUrl: input.profileUrl ?? null,
    avatarUrl: input.avatarUrl ?? null,
    accessTokenEnc: input.accessTokenEnc,
    refreshTokenEnc: input.refreshTokenEnc ?? null,
    scopes: input.scopes,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    status: "active",
    lastError: null,
    connectedByUserId: input.connectedByUserId,
  };
  const [row] = await db
    .insert(socialConnections)
    .values({ organizationId, platform: input.platform, externalAccountId: input.externalAccountId, ...values })
    .onConflictDoUpdate({
      target: [socialConnections.organizationId, socialConnections.platform, socialConnections.externalAccountId],
      set: values,
    })
    .returning(publicColumns);
  return row!;
}

/** Removes the connection and (by cascade) its stored tokens and events. */
export async function deleteSocialConnection(db: Db, organizationId: OrganizationId, id: string): Promise<boolean> {
  const rows = await db
    .delete(socialConnections)
    .where(and(eq(socialConnections.organizationId, organizationId), eq(socialConnections.id, id)))
    .returning({ id: socialConnections.id });
  return rows.length > 0;
}

/**
 * Worker only (no organization argument by design, like listActiveSources):
 * connections whose turn to be polled has come, with the sealed tokens.
 */
export async function listConnectionsToSync(db: Db, platform: string, minIntervalMs: number, now = new Date()) {
  const dueBefore = new Date(now.getTime() - minIntervalMs);
  return db
    .select()
    .from(socialConnections)
    .where(
      and(
        eq(socialConnections.platform, platform),
        // needs_reauth waits for the customer; active and error are retried.
        or(eq(socialConnections.status, "active"), eq(socialConnections.status, "error")),
        or(isNull(socialConnections.lastSyncAt), lt(socialConnections.lastSyncAt, dueBefore)),
      ),
    );
}

export async function updateConnectionTokens(
  db: Db,
  id: string,
  input: { accessTokenEnc: string; refreshTokenEnc?: string | null; tokenExpiresAt?: Date | null },
) {
  await db
    .update(socialConnections)
    .set({
      accessTokenEnc: input.accessTokenEnc,
      ...(input.refreshTokenEnc !== undefined ? { refreshTokenEnc: input.refreshTokenEnc } : {}),
      tokenExpiresAt: input.tokenExpiresAt ?? null,
    })
    .where(eq(socialConnections.id, id));
}

export async function markConnectionSynced(db: Db, id: string, cursor: Record<string, string>) {
  await db
    .update(socialConnections)
    .set({ status: "active", lastError: null, lastSyncAt: new Date(), cursor })
    .where(eq(socialConnections.id, id));
}

export async function markConnectionFailed(db: Db, id: string, status: "needs_reauth" | "error", message: string) {
  await db
    .update(socialConnections)
    .set({ status, lastError: message.slice(0, 300), lastSyncAt: new Date() })
    .where(eq(socialConnections.id, id));
}

export type NewSocialEvent = {
  kind: string;
  externalId: string;
  url: string;
  authorHandle?: string | null;
  authorName?: string | null;
  excerpt: string;
  occurredAt: Date;
};

/** Stores what is new and returns only that — a post seen on an earlier poll is skipped. */
export async function insertSocialEvents(
  db: Db,
  connection: { id: string; organizationId: string; platform: string },
  events: NewSocialEvent[],
): Promise<SocialConnectionEvent[]> {
  if (events.length === 0) return [];
  return db
    .insert(socialConnectionEvents)
    .values(
      events.map((event) => ({
        organizationId: connection.organizationId,
        connectionId: connection.id,
        platform: connection.platform,
        kind: event.kind,
        externalId: event.externalId,
        url: event.url,
        authorHandle: event.authorHandle ?? null,
        authorName: event.authorName ?? null,
        excerpt: event.excerpt,
        occurredAt: event.occurredAt,
      })),
    )
    .onConflictDoNothing()
    .returning();
}

export type SocialEventRow = SocialConnectionEvent & { connectionHandle: string };

export async function listSocialEvents(db: Db, organizationId: OrganizationId, limit = 50): Promise<SocialEventRow[]> {
  const rows = await db
    .select({ event: socialConnectionEvents, connectionHandle: socialConnections.handle })
    .from(socialConnectionEvents)
    .innerJoin(socialConnections, eq(socialConnections.id, socialConnectionEvents.connectionId))
    .where(eq(socialConnectionEvents.organizationId, organizationId))
    .orderBy(desc(socialConnectionEvents.occurredAt), desc(socialConnectionEvents.id))
    .limit(limit);
  return rows.map((row) => ({ ...row.event, connectionHandle: row.connectionHandle }));
}

export async function countUnreadSocialEvents(db: Db, organizationId: OrganizationId): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(socialConnectionEvents)
    .where(and(eq(socialConnectionEvents.organizationId, organizationId), isNull(socialConnectionEvents.readAt)));
  return row?.n ?? 0;
}

export async function markSocialEventsRead(db: Db, organizationId: OrganizationId): Promise<void> {
  await db
    .update(socialConnectionEvents)
    .set({ readAt: new Date() })
    .where(and(eq(socialConnectionEvents.organizationId, organizationId), isNull(socialConnectionEvents.readAt)));
}
