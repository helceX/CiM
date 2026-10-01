import { excerptOf, readJson, type SocialProvider, type SocialTokens } from "./provider";

const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

function tokensFrom(body: TokenResponse, keepRefresh?: string): SocialTokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? keepRefresh ?? null,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : null,
    scopes: body.scope ?? SCOPE,
  };
}

/**
 * YouTube Data API v3 with the customer's own Google grant (read-only scope).
 * Reads new comments on videos of the connected channel — 1 quota unit per poll.
 * YouTube offers no API for "mentions of my channel elsewhere", so that is not claimed.
 */
export const youtubeProvider: SocialProvider = {
  key: "youtube",
  label: "YouTube",
  reads: "New comments on the videos of the channel you connect (read-only).",
  requiredEnv: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
  minPollIntervalMs: 15 * 60_000,
  isConfigured: (env) => Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET),

  authorizeUrl({ env, redirectUri, state, codeChallenge }) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  },

  async exchangeCode({ env, code, redirectUri, codeVerifier, fetch }) {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.YOUTUBE_CLIENT_ID!,
        client_secret: env.YOUTUBE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });
    const tokens = tokensFrom(await readJson<TokenResponse>(tokenResponse, "YouTube token exchange"));

    const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const channels = await readJson<{
      items?: { id: string; snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }[];
    }>(channelResponse, "YouTube channel lookup");
    const channel = channels.items?.[0];
    if (!channel) throw new Error("This Google account has no YouTube channel to connect.");
    const handle = channel.snippet?.customUrl ?? channel.id;
    return {
      tokens,
      account: {
        externalId: channel.id,
        handle,
        displayName: channel.snippet?.title ?? null,
        profileUrl: `https://www.youtube.com/channel/${channel.id}`,
        avatarUrl: channel.snippet?.thumbnails?.default?.url ?? null,
      },
    };
  },

  async refresh({ env, refreshToken, fetch }) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.YOUTUBE_CLIENT_ID!,
        client_secret: env.YOUTUBE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    return tokensFrom(await readJson<TokenResponse>(response, "YouTube token refresh"), refreshToken);
  },

  async fetchEvents({ accessToken, account, cursor, notBefore, fetch }) {
    const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    url.search = new URLSearchParams({
      part: "snippet",
      allThreadsRelatedToChannelId: account.externalId,
      order: "time",
      maxResults: "50",
      textFormat: "plainText",
    }).toString();
    const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${accessToken}` } });
    const body = await readJson<{
      items?: {
        id: string;
        snippet?: {
          videoId?: string;
          topLevelComment?: {
            id: string;
            snippet?: {
              authorDisplayName?: string;
              authorChannelId?: { value?: string };
              textDisplay?: string;
              publishedAt?: string;
            };
          };
        };
      }[];
    }>(response, "YouTube comments");

    const since = cursor.since ? new Date(cursor.since) : notBefore;
    const floor = since > notBefore ? since : notBefore;
    let newest = cursor.since ? new Date(cursor.since) : null;
    const events = [];
    for (const item of body.items ?? []) {
      const comment = item.snippet?.topLevelComment;
      const published = comment?.snippet?.publishedAt ? new Date(comment.snippet.publishedAt) : null;
      if (!comment || !published || Number.isNaN(published.getTime())) continue;
      if (newest === null || published > newest) newest = published;
      if (published <= floor) continue;
      // Your own replies and comments on your own videos aren't something to be told about.
      if (comment.snippet?.authorChannelId?.value === account.externalId) continue;
      events.push({
        kind: "comment" as const,
        externalId: comment.id,
        url: `https://www.youtube.com/watch?v=${item.snippet?.videoId ?? ""}&lc=${comment.id}`,
        authorHandle: null,
        authorName: comment.snippet?.authorDisplayName ?? null,
        excerpt: excerptOf(comment.snippet?.textDisplay ?? ""),
        occurredAt: published,
      });
    }
    return { events, cursor: newest ? { since: newest.toISOString() } : cursor };
  },
};
