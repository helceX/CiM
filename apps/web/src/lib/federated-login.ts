import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
export { safeLoginNext } from "./login-redirect";

export const LOGIN_PROVIDERS = ["google", "github", "microsoft"] as const;
export type LoginProvider = typeof LOGIN_PROVIDERS[number];
export type LoginIdentity = { provider: LoginProvider; subject: string; email: string; emailVerified: boolean; name: string; blogSource?: string };
export type LoginFlow = { provider: LoginProvider; state: string; verifier: string; userId: string | null; next: string; expires: number; blogSource?: string };
export const FLOW_COOKIE = "cim_login_flow";
export const PENDING_COOKIE = "cim_login_pending";
export const LOGIN_TTL = 600;

export function loginProvider(value: string): LoginProvider | null { return LOGIN_PROVIDERS.find(provider => provider === value) ?? null; }
export function loginCredentials(provider: LoginProvider) {
  const key = `LOGIN_${provider.toUpperCase()}`;
  return { id: process.env[`${key}_CLIENT_ID`] ?? "", secret: process.env[`${key}_CLIENT_SECRET`] ?? "" };
}
export function configuredLoginProviders() { return LOGIN_PROVIDERS.filter(provider => { const credentials = loginCredentials(provider); return Boolean(credentials.id && credentials.secret); }); }
export function sealLoginValue(value: object, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(`federated-login:${secret}`).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function openLoginValue<T extends { expires: number }>(raw: string | undefined, secret: string): T | null {
  if (!raw || raw.length > 6000) return null;
  try {
    const bytes = Buffer.from(raw, "base64url");
    const cipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(`federated-login:${secret}`).digest(), bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8")) as T;
    return value.expires > Date.now() && value.expires <= Date.now() + LOGIN_TTL * 1000 + 5000 ? value : null;
  } catch { return null; }
}
const endpoints = {
  google: { authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", user: "https://openidconnect.googleapis.com/v1/userinfo", scope: "openid email profile" },
  github: { authorize: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token", user: "https://api.github.com/user", scope: "read:user user:email" },
  microsoft: { authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", user: "https://graph.microsoft.com/oidc/userinfo", scope: "openid email profile" },
};
export function loginAuthorizeUrl(flow: LoginFlow, callback: string) {
  const url = new URL(endpoints[flow.provider].authorize);
  url.search = new URLSearchParams({ client_id: loginCredentials(flow.provider).id, redirect_uri: callback, response_type: "code", scope: endpoints[flow.provider].scope, state: flow.state, code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  return url.href;
}
async function providerJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000), headers: { accept: "application/json", "user-agent": "Mediaory", ...init.headers } });
  if (!response.ok) throw new Error("Provider request failed");
  return response.json();
}
export async function exchangeLogin(flow: LoginFlow, code: string, callback: string): Promise<LoginIdentity> {
  const credentials = loginCredentials(flow.provider);
  const token = await providerJson(endpoints[flow.provider].token, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", client_id: credentials.id, client_secret: credentials.secret, code, redirect_uri: callback, code_verifier: flow.verifier }) }) as { access_token?: string; error?: string };
  if (token.error || !token.access_token) throw new Error("Missing access token");
  const headers = { authorization: `Bearer ${token.access_token}` };
  const user = await providerJson(endpoints[flow.provider].user, { headers }) as { sub?: string; id?: number; name?: string; login?: string; email?: string; email_verified?: boolean };
  let email = user.email ?? "";
  let emailVerified = flow.provider === "google" && user.email_verified === true;
  if (flow.provider === "github") {
    const emails = await providerJson("https://api.github.com/user/emails", { headers }) as { email: string; primary: boolean; verified: boolean }[];
    const selected = emails.find(item => item.primary && item.verified);
    if (!selected) throw new Error("Verified email required");
    email = selected.email; emailVerified = true;
  }
  // Microsoft does not promise that its email claim is verified. Mediaory sends its own verification.
  const subject = flow.provider === "github" ? String(user.id ?? "") : user.sub;
  if (!subject || subject.length > 255 || email.length > 255 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Invalid identity");
  return { provider: flow.provider, subject, email: email.toLowerCase(), emailVerified, name: (user.name ?? user.login ?? "").slice(0, 160) };
}
