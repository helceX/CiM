import {
  asOrganizationId,
  createNotificationForOrgMembers,
  createNotificationForUser,
  db,
  insertSocialEvents,
  listConnectionsToSync,
  markConnectionFailed,
  markConnectionSynced,
  updateConnectionTokens,
} from "@cim/db";
import type { SocialConnection } from "@cim/db/schema";
import {
  SOCIAL_PROVIDERS,
  SocialAuthError,
  decryptSecret,
  encryptSecret,
  tokenSecretFromEnv,
  type FetchLike,
  type SocialProvider,
} from "@cim/ingestion";

const FIRST_SYNC_LOOKBACK_MS = 3 * 24 * 60 * 60_000;
const REFRESH_MARGIN_MS = 2 * 60_000;
/** One notification per new post up to this many; the rest are summarised so a flood stays readable. */
const MAX_INDIVIDUAL_NOTIFICATIONS = 8;

export type SyncDeps = {
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
  now?: () => Date;
};

/**
 * Polls every connected account that is due (each provider has its own minimum
 * interval — X is billed per read, so it waits longer than YouTube) and turns
 * what is new into stored events plus notifications that link straight to the
 * post. Failures are isolated per connection; a grant the platform rejected
 * is marked `needs_reauth` and the customer is told to reconnect.
 */
export async function processSyncSocialConnectionsJob(deps: SyncDeps = {}): Promise<void> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  for (const provider of SOCIAL_PROVIDERS) {
    if (!provider.isConfigured(env)) continue;
    const due = await listConnectionsToSync(db, provider.key, provider.minPollIntervalMs, now());
    for (const connection of due) {
      try {
        await syncConnection(provider, connection, { env, fetch: deps.fetch ?? fetch, now });
      } catch (error) {
        console.error(`[worker] sync_social_connections failed for connection ${connection.id}:`, error);
      }
    }
  }
}

async function syncConnection(
  provider: SocialProvider,
  connection: SocialConnection,
  ctx: { env: Record<string, string | undefined>; fetch: FetchLike; now: () => Date },
): Promise<void> {
  const secret = tokenSecretFromEnv(ctx.env);

  let accessToken: string;
  try {
    accessToken = decryptSecret(connection.accessTokenEnc, secret);
  } catch {
    await failAuth(connection, "Stored credentials could not be read — please reconnect.");
    return;
  }

  try {
    // Renew a token that is about to expire (or already has) before asking for anything.
    if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() - ctx.now().getTime() < REFRESH_MARGIN_MS) {
      if (!connection.refreshTokenEnc) throw new SocialAuthError("The access expired and cannot be renewed.");
      const refreshed = await provider.refresh({
        env: ctx.env,
        refreshToken: decryptSecret(connection.refreshTokenEnc, secret),
        fetch: ctx.fetch,
      });
      accessToken = refreshed.accessToken;
      await updateConnectionTokens(db, connection.id, {
        accessTokenEnc: encryptSecret(refreshed.accessToken, secret),
        refreshTokenEnc: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken, secret) : undefined,
        tokenExpiresAt: refreshed.expiresAt ?? null,
      });
    }

    const firstSync = connection.lastSyncAt === null;
    const { events, cursor } = await provider.fetchEvents({
      accessToken,
      account: { externalId: connection.externalAccountId, handle: connection.handle },
      cursor: connection.cursor,
      notBefore: new Date(firstSync ? ctx.now().getTime() - FIRST_SYNC_LOOKBACK_MS : 0),
      fetch: ctx.fetch,
    });

    const inserted = await insertSocialEvents(db, connection, events);
    await notifyAbout(provider, connection, inserted);
    await markConnectionSynced(db, connection.id, cursor);
  } catch (error) {
    if (error instanceof SocialAuthError) {
      await failAuth(connection, error.message);
      return;
    }
    await markConnectionFailed(db, connection.id, "error", error instanceof Error ? error.message : "Sync failed");
    throw error;
  }
}

async function failAuth(connection: SocialConnection, message: string): Promise<void> {
  await markConnectionFailed(db, connection.id, "needs_reauth", message);
  const organizationId = asOrganizationId(connection.organizationId);
  const input = {
    kind: "system" as const,
    title: `Reconnect ${connection.handle}`,
    body: "The platform no longer lets Mediaory read this account. Reconnect it in Settings to keep getting mentions.",
    linkUrl: "/settings",
  };
  if (connection.connectedByUserId) await createNotificationForUser(db, organizationId, connection.connectedByUserId, input);
  else await createNotificationForOrgMembers(db, organizationId, input);
}

async function notifyAbout(
  provider: SocialProvider,
  connection: SocialConnection,
  inserted: { kind: string; url: string; authorHandle: string | null; authorName: string | null; excerpt: string }[],
): Promise<void> {
  if (inserted.length === 0) return;
  const organizationId = asOrganizationId(connection.organizationId);
  const send = (input: { title: string; body: string; linkUrl: string }) =>
    connection.connectedByUserId
      ? createNotificationForUser(db, organizationId, connection.connectedByUserId, { kind: "alert", ...input })
      : createNotificationForOrgMembers(db, organizationId, { kind: "alert", ...input });

  for (const event of inserted.slice(0, MAX_INDIVIDUAL_NOTIFICATIONS)) {
    const who = event.authorHandle ?? event.authorName ?? "Someone";
    const what = event.kind === "comment" ? "commented on your video" : event.kind === "reply" ? "replied to you" : "mentioned you";
    await send({
      title: `${who} ${what} on ${provider.label}`,
      body: event.excerpt,
      linkUrl: event.url,
    });
  }
  const rest = inserted.length - MAX_INDIVIDUAL_NOTIFICATIONS;
  if (rest > 0) {
    await send({
      title: `${rest} more on ${provider.label}`,
      body: `${rest} more new mentions and comments for ${connection.handle}.`,
      linkUrl: "/social/mentions",
    });
  }
}
