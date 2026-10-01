import { excerptOf, readJson, type SocialProvider, type SocialTokens } from "./provider";

const SCOPES = "tweet.read users.read offline.access";

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

function basic(env: Record<string, string | undefined>): Record<string, string> {
  // A "confidential client" authenticates with its id and secret; a public one sends only the id in the body.
  return env.X_CLIENT_SECRET
    ? { authorization: `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString("base64")}` }
    : {};
}

function tokensFrom(body: TokenResponse, keepRefresh?: string): SocialTokens {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? keepRefresh ?? null,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : null,
    scopes: body.scope ?? SCOPES,
  };
}

/**
 * X (Twitter) API v2 with the customer's own OAuth 2.0 grant. Reads posts that
 * mention the connected account. The X API is pay-per-use — every post read is
 * billed to the operator's developer account — so polling is every 30 minutes
 * and only asks for posts newer than the last one seen.
 */
export const xProvider: SocialProvider = {
  key: "x",
  label: "X",
  reads: "Posts that mention or tag the account you connect (read-only).",
  requiredEnv: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  minPollIntervalMs: 30 * 60_000,
  isConfigured: (env) => Boolean(env.X_CLIENT_ID),

  authorizeUrl({ env, redirectUri, state, codeChallenge }) {
    const url = new URL("https://x.com/i/oauth2/authorize");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: env.X_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  },

  async exchangeCode({ env, code, redirectUri, codeVerifier, fetch }) {
    const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...basic(env) },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: env.X_CLIENT_ID!,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });
    const tokens = tokensFrom(await readJson<TokenResponse>(tokenResponse, "X token exchange"));

    const meResponse = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url", {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const me = await readJson<{ data?: { id: string; username: string; name?: string; profile_image_url?: string } }>(
      meResponse,
      "X account lookup",
    );
    if (!me.data) throw new Error("X did not return the account.");
    return {
      tokens,
      account: {
        externalId: me.data.id,
        handle: `@${me.data.username}`,
        displayName: me.data.name ?? null,
        profileUrl: `https://x.com/${me.data.username}`,
        avatarUrl: me.data.profile_image_url ?? null,
      },
    };
  },

  async refresh({ env, refreshToken, fetch }) {
    const response = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...basic(env) },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: env.X_CLIENT_ID! }),
    });
    return tokensFrom(await readJson<TokenResponse>(response, "X token refresh"), refreshToken);
  },

  async fetchEvents({ accessToken, account, cursor, notBefore, fetch }) {
    const params = new URLSearchParams({
      max_results: "50",
      "tweet.fields": "created_at,author_id",
      expansions: "author_id",
      "user.fields": "username,name",
    });
    if (cursor.sinceId) params.set("since_id", cursor.sinceId);
    else params.set("start_time", notBefore.toISOString());
    const response = await fetch(`https://api.x.com/2/users/${encodeURIComponent(account.externalId)}/mentions?${params}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const body = await readJson<{
      data?: { id: string; text: string; created_at?: string; author_id?: string }[];
      includes?: { users?: { id: string; username: string; name?: string }[] };
      meta?: { newest_id?: string };
    }>(response, "X mentions");

    const users = new Map((body.includes?.users ?? []).map((user) => [user.id, user]));
    const events = (body.data ?? []).map((post) => {
      const author = post.author_id ? users.get(post.author_id) : undefined;
      return {
        kind: "mention" as const,
        externalId: post.id,
        // /i/web/status/<id> resolves to the post even when the author's handle isn't known.
        url: author ? `https://x.com/${author.username}/status/${post.id}` : `https://x.com/i/web/status/${post.id}`,
        authorHandle: author ? `@${author.username}` : null,
        authorName: author?.name ?? null,
        excerpt: excerptOf(post.text),
        occurredAt: post.created_at ? new Date(post.created_at) : new Date(),
      };
    });
    return { events, cursor: body.meta?.newest_id ? { sinceId: body.meta.newest_id } : cursor };
  },
};
