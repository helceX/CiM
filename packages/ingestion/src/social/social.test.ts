import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";
import { SocialAuthError, type FetchLike } from "./provider";
import { configuredSocialProviders, getSocialProvider } from "./registry";
import { xProvider } from "./x";
import { youtubeProvider } from "./youtube";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const routed =
  (routes: Record<string, () => Response>): FetchLike =>
  async (input) => {
    const hit = Object.entries(routes).find(([prefix]) => input.startsWith(prefix));
    if (!hit) throw new Error(`unexpected request ${input}`);
    return hit[1]();
  };

describe("token encryption", () => {
  it("round-trips, never repeats, and refuses a wrong key or a tampered value", () => {
    const sealed = encryptSecret("ya29.a0-token", "secret-one-secret-one-secret-one-xx");
    expect(sealed).not.toContain("ya29");
    expect(encryptSecret("ya29.a0-token", "secret-one-secret-one-secret-one-xx")).not.toBe(sealed);
    expect(decryptSecret(sealed, "secret-one-secret-one-secret-one-xx")).toBe("ya29.a0-token");
    expect(() => decryptSecret(sealed, "another-secret-another-secret-xxxxx")).toThrow();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), "secret-one-secret-one-secret-one-xx")).toThrow();
  });
});

describe("provider registry", () => {
  it("offers only providers the operator configured", () => {
    expect(configuredSocialProviders({}).map((p) => p.key)).toEqual([]);
    expect(configuredSocialProviders({ YOUTUBE_CLIENT_ID: "a", YOUTUBE_CLIENT_SECRET: "b", X_CLIENT_ID: "c" }).map((p) => p.key)).toEqual([
      "youtube",
      "x",
    ]);
    expect(configuredSocialProviders({ SOCIAL_MOCK_PROVIDER: "1" }).map((p) => p.key)).toEqual(["mock"]);
    expect(getSocialProvider("nope")).toBeUndefined();
  });
});

describe("YouTube provider", () => {
  const env = { YOUTUBE_CLIENT_ID: "cid", YOUTUBE_CLIENT_SECRET: "csecret" };

  it("asks only for the read-only scope, with PKCE and offline access", () => {
    const url = new URL(youtubeProvider.authorizeUrl({ env, redirectUri: "https://app.test/cb", state: "st", codeChallenge: "chal" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube.readonly");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("st");
  });

  it("exchanges a code and reads the channel", async () => {
    const result = await youtubeProvider.exchangeCode({
      env,
      code: "c",
      redirectUri: "https://app.test/cb",
      codeVerifier: "v",
      fetch: routed({
        "https://oauth2.googleapis.com/token": () => json({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
        "https://www.googleapis.com/youtube/v3/channels": () => json({ items: [{ id: "UC123", snippet: { title: "My Channel", customUrl: "@mychannel" } }] }),
      }),
    });
    expect(result.account).toMatchObject({ externalId: "UC123", handle: "@mychannel", displayName: "My Channel" });
    expect(result.tokens.refreshToken).toBe("rt");
    expect(result.tokens.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns new comments with a direct link, skips the owner's own, and advances the cursor", async () => {
    const comments = {
      items: [
        { id: "c3", snippet: { videoId: "vid1", topLevelComment: { id: "c3", snippet: { authorDisplayName: "Ayşe", authorChannelId: { value: "UCother" }, textDisplay: "Great <b>video</b>", publishedAt: "2026-10-01T10:00:00Z" } } } },
        { id: "c2", snippet: { videoId: "vid1", topLevelComment: { id: "c2", snippet: { authorDisplayName: "Me", authorChannelId: { value: "UC123" }, textDisplay: "thanks", publishedAt: "2026-10-01T09:00:00Z" } } } },
        { id: "c1", snippet: { videoId: "vid0", topLevelComment: { id: "c1", snippet: { authorDisplayName: "Old", authorChannelId: { value: "UCx" }, textDisplay: "old", publishedAt: "2026-09-01T09:00:00Z" } } } },
      ],
    };
    const first = await youtubeProvider.fetchEvents({
      accessToken: "at",
      account: { externalId: "UC123", handle: "@mychannel" },
      cursor: {},
      notBefore: new Date("2026-09-28T00:00:00Z"),
      fetch: routed({ "https://www.googleapis.com/youtube/v3/commentThreads": () => json(comments) }),
    });
    expect(first.events.map((e) => e.externalId)).toEqual(["c3"]);
    expect(first.events[0]).toMatchObject({ url: "https://www.youtube.com/watch?v=vid1&lc=c3", authorName: "Ayşe", excerpt: "Great video" });
    expect(first.cursor).toEqual({ since: "2026-10-01T10:00:00.000Z" });

    const second = await youtubeProvider.fetchEvents({
      accessToken: "at",
      account: { externalId: "UC123", handle: "@mychannel" },
      cursor: first.cursor,
      notBefore: new Date("2026-09-28T00:00:00Z"),
      fetch: routed({ "https://www.googleapis.com/youtube/v3/commentThreads": () => json(comments) }),
    });
    expect(second.events).toEqual([]);
  });

  it("reports a revoked grant as an auth error and other failures as plain errors", async () => {
    const input = { accessToken: "at", account: { externalId: "UC123", handle: "h" }, cursor: {}, notBefore: new Date(0) };
    await expect(
      youtubeProvider.fetchEvents({ ...input, fetch: routed({ "https://www.googleapis.com": () => json({ error: "x" }, 401) }) }),
    ).rejects.toBeInstanceOf(SocialAuthError);
    await expect(
      youtubeProvider.fetchEvents({ ...input, fetch: routed({ "https://www.googleapis.com": () => json({}, 500) }) }),
    ).rejects.not.toBeInstanceOf(SocialAuthError);
  });
});

describe("X provider", () => {
  const env = { X_CLIENT_ID: "xid", X_CLIENT_SECRET: "xsecret" };

  it("requests only read scopes with PKCE", () => {
    const url = new URL(xProvider.authorizeUrl({ env, redirectUri: "https://app.test/cb", state: "st", codeChallenge: "chal" }));
    expect(url.searchParams.get("scope")).toBe("tweet.read users.read offline.access");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("looks up the account after the exchange and keeps the refresh token on refresh", async () => {
    const result = await xProvider.exchangeCode({
      env,
      code: "c",
      redirectUri: "https://app.test/cb",
      codeVerifier: "v",
      fetch: routed({
        "https://api.x.com/2/oauth2/token": () => json({ access_token: "at", refresh_token: "rt", expires_in: 7200 }),
        "https://api.x.com/2/users/me": () => json({ data: { id: "42", username: "brand", name: "Brand" } }),
      }),
    });
    expect(result.account).toMatchObject({ externalId: "42", handle: "@brand", profileUrl: "https://x.com/brand" });
    const refreshed = await xProvider.refresh({
      env,
      refreshToken: "rt",
      fetch: routed({ "https://api.x.com/2/oauth2/token": () => json({ access_token: "at2", expires_in: 7200 }) }),
    });
    expect(refreshed).toMatchObject({ accessToken: "at2", refreshToken: "rt" });
  });

  it("maps mentions to links, asks only for newer posts, and keeps the newest id", async () => {
    let requested = "";
    const result = await xProvider.fetchEvents({
      accessToken: "at",
      account: { externalId: "42", handle: "@brand" },
      cursor: { sinceId: "100" },
      notBefore: new Date(0),
      fetch: async (input) => {
        requested = input;
        return json({
          data: [{ id: "101", text: "hey @brand check this", created_at: "2026-10-01T10:00:00Z", author_id: "7" }],
          includes: { users: [{ id: "7", username: "fan", name: "A Fan" }] },
          meta: { newest_id: "101" },
        });
      },
    });
    expect(requested).toContain("since_id=100");
    expect(requested).not.toContain("start_time");
    expect(result.events[0]).toMatchObject({ kind: "mention", url: "https://x.com/fan/status/101", authorHandle: "@fan" });
    expect(result.cursor).toEqual({ sinceId: "101" });
  });

  it("looks back from notBefore on the first sync and leaves the cursor alone when nothing is new", async () => {
    let requested = "";
    const result = await xProvider.fetchEvents({
      accessToken: "at",
      account: { externalId: "42", handle: "@brand" },
      cursor: {},
      notBefore: new Date("2026-09-28T00:00:00Z"),
      fetch: async (input) => {
        requested = input;
        return json({ meta: { result_count: 0 } });
      },
    });
    expect(requested).toContain("start_time=2026-09-28T00%3A00%3A00.000Z");
    expect(result).toEqual({ events: [], cursor: {} });
  });
});
