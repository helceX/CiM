import type { SocialProvider } from "./provider";

/**
 * A stand-in "platform" for development, demos and the end-to-end tests: it
 * connects instantly (no external sign-in) and reports two fixed mentions. It is
 * available only when SOCIAL_MOCK_PROVIDER=1 outside production and never talks to a network.
 */
export const mockSocialProvider: SocialProvider = {
  key: "mock",
  label: "Demo network",
  reads: "Two sample mentions, so you can see how alerts and links work. Nothing leaves Mediaory.",
  requiredEnv: ["SOCIAL_MOCK_PROVIDER"],
  minPollIntervalMs: 60_000,
  isConfigured: (env) => env.SOCIAL_MOCK_PROVIDER === "1" && env.NODE_ENV !== "production",
  authorizeUrl: ({ redirectUri, state }) => `${redirectUri}?code=mock-code&state=${encodeURIComponent(state)}`,
  async exchangeCode() {
    return {
      tokens: { accessToken: "mock-access", refreshToken: "mock-refresh", expiresAt: null, scopes: "mock" },
      account: {
        externalId: "mock-account",
        handle: "@mediaory_demo",
        displayName: "Mediaory demo account",
        profileUrl: "https://social.example/mediaory_demo",
      },
    };
  },
  async refresh() {
    return { accessToken: "mock-access", refreshToken: "mock-refresh", expiresAt: null, scopes: "mock" };
  },
  async fetchEvents({ cursor }) {
    const now = Date.now();
    return {
      events: [
        {
          kind: "mention" as const,
          externalId: "mock-1",
          url: "https://social.example/someone/status/1",
          authorHandle: "@someone",
          authorName: "Someone",
          excerpt: "Loving what @mediaory_demo shipped this week.",
          occurredAt: new Date(now - 3_600_000),
        },
        {
          kind: "comment" as const,
          externalId: "mock-2",
          url: "https://social.example/watch/2#comment",
          authorHandle: "@viewer",
          authorName: "A viewer",
          excerpt: "Can you cover the launch next?",
          occurredAt: new Date(now - 1_800_000),
        },
      ],
      cursor: { ...cursor, seen: "1" },
    };
  },
};
