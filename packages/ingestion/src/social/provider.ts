/**
 * A social platform a customer can link their own account from. Each provider
 * talks only to that platform's OFFICIAL API with the customer's own OAuth
 * grant — no scraping, no shared logins. See docs/product/SOCIAL_MEDIA.md.
 */
export type SocialEnv = Record<string, string | undefined>;
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type SocialTokens = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes: string;
};

export type SocialAccount = {
  externalId: string;
  handle: string;
  displayName?: string | null;
  profileUrl?: string | null;
  avatarUrl?: string | null;
};

export type SocialEventKind = "mention" | "comment" | "reply";

export type SocialEvent = {
  kind: SocialEventKind;
  externalId: string;
  /** Link straight to the post / comment. https only. */
  url: string;
  authorHandle?: string | null;
  authorName?: string | null;
  /** Short excerpt only (≤ 280 chars). */
  excerpt: string;
  occurredAt: Date;
};

export type FetchEventsInput = {
  accessToken: string;
  account: { externalId: string; handle: string };
  cursor: Record<string, string>;
  /** Never return anything older than this (first sync looks back a few days, not forever). */
  notBefore: Date;
  fetch: FetchLike;
};

export interface SocialProvider {
  key: string;
  label: string;
  /** One honest sentence on what is read — shown to the customer before they connect. */
  reads: string;
  /** Environment variables the operator must set (names only, never values) — shown in admin/docs. */
  requiredEnv: string[];
  minPollIntervalMs: number;
  isConfigured(env: SocialEnv): boolean;
  authorizeUrl(input: { env: SocialEnv; redirectUri: string; state: string; codeChallenge: string }): string;
  exchangeCode(input: {
    env: SocialEnv;
    code: string;
    redirectUri: string;
    codeVerifier: string;
    fetch: FetchLike;
  }): Promise<{ tokens: SocialTokens; account: SocialAccount }>;
  refresh(input: { env: SocialEnv; refreshToken: string; fetch: FetchLike }): Promise<SocialTokens>;
  fetchEvents(input: FetchEventsInput): Promise<{ events: SocialEvent[]; cursor: Record<string, string> }>;
}

/** The platform rejected the token (revoked, expired for good): the customer must reconnect. */
export class SocialAuthError extends Error {
  constructor(message = "The platform no longer accepts this connection.") {
    super(message);
    this.name = "SocialAuthError";
  }
}

export function excerptOf(text: string, max = 280): string {
  const flat = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export async function readJson<T>(response: Response, what: string): Promise<T> {
  if (response.status === 401 || response.status === 403) {
    // 403 can also be a quota / permission problem; callers distinguish via body when it matters.
    const body = await response.text().catch(() => "");
    if (response.status === 401 || /invalid_grant|invalid_token|revoked|unauthorized/i.test(body)) throw new SocialAuthError();
    throw new Error(`${what}: the platform refused the request (403).`);
  }
  if (!response.ok) throw new Error(`${what}: HTTP ${response.status}`);
  return (await response.json()) as T;
}
