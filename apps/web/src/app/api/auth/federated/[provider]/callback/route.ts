import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv } from "@cim/config";
import { db, findLoginIdentity, findUserByEmail, linkLoginIdentity } from "@cim/db";
import { exchangeLogin, FLOW_COOKIE, LOGIN_TTL, loginProvider, openLoginValue, PENDING_COOKIE, sealLoginValue, type LoginFlow } from "@/lib/federated-login";
import { createUserSession, getCurrentUser } from "@/lib/session";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const env = getEnv(); const store = await cookies();
  const flow = openLoginValue<LoginFlow>(store.get(FLOW_COOKIE)?.value, env.SESSION_SECRET);
  store.delete(FLOW_COOKIE); store.delete(PENDING_COOKIE);
  const provider = loginProvider((await params).provider); const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? ""; const code = url.searchParams.get("code");
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?federated=${reason}`, env.APP_URL));
  if (!flow || provider !== flow.provider || !code || code.length > 4096 || url.searchParams.has("error") || Buffer.byteLength(state) !== Buffer.byteLength(flow.state) || !timingSafeEqual(Buffer.from(state), Buffer.from(flow.state))) return fail("failed");
  if (!(await checkRateLimit(`federated-callback:${clientIpFrom(request)}`, { limit: 30, windowSeconds: 900 })).allowed) return fail("failed");
  try {
    const identity = await exchangeLogin(flow, code, `${env.APP_URL}/api/auth/federated/${provider}/callback`);
    if (flow.userId) {
      const current = await getCurrentUser();
      if (!current || current.id !== flow.userId || !current.emailVerifiedAt) return fail("failed");
      await linkLoginIdentity(db, current.id, identity.provider, identity.subject);
      return NextResponse.redirect(new URL("/settings/login-methods?linked=1", env.APP_URL));
    }
    const user = await findLoginIdentity(db, identity.provider, identity.subject);
    if (user) {
      if (user.deletedAt || !user.emailVerifiedAt) return fail("verify");
      await createUserSession(user.id, { userAgent: request.headers.get("user-agent") ?? undefined, ipAddress: clientIpFrom(request) });
      return NextResponse.redirect(new URL(flow.next, env.APP_URL));
    }
    // Never merge identities by email alone, including privileged accounts.
    if (identity.email && await findUserByEmail(db, identity.email)) return fail("link");
    store.set(PENDING_COOKIE, sealLoginValue({ ...identity, expires: Date.now() + LOGIN_TTL * 1000 }, env.SESSION_SECRET), { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: LOGIN_TTL });
    return NextResponse.redirect(new URL("/register?federated=1", env.APP_URL));
  } catch (error) {
    // Only fixed stage/status identifiers may leave the server; never expose provider responses or credentials.
    const reference = error instanceof Error && "reference" in error && typeof error.reference === "string" && /^(token|profile|email)_(rejected|http_[1-5][0-9]{2})$/.test(error.reference) ? error.reference : "unavailable";
    const target = new URL("/login?federated=failed", env.APP_URL);
    target.searchParams.set("reference", reference);
    return NextResponse.redirect(target);
  }
}
