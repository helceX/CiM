import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getEnv } from "@cim/config";
import { configuredLoginProviders, FLOW_COOKIE, LOGIN_TTL, loginAuthorizeUrl, loginProvider, safeLoginNext, sealLoginValue, type LoginFlow } from "@/lib/federated-login";
import { getCurrentUser } from "@/lib/session";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import { validBlogSource } from "@/lib/blog-attribution";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = loginProvider((await params).provider);
  const env = getEnv();
  if (!provider || !configuredLoginProviders().includes(provider)) return NextResponse.redirect(new URL("/login?federated=unavailable", env.APP_URL));
  if (!(await checkRateLimit(`federated-start:${clientIpFrom(request)}`, { limit: 30, windowSeconds: 900 })).allowed) return new NextResponse("Too many attempts", { status: 429 });
  const url = new URL(request.url);
  let userId: string | null = null;
  if (url.searchParams.get("mode") === "link") {
    const user = await getCurrentUser();
    const referrer = request.headers.get("referer");
    let sameOrigin = false;
    try { sameOrigin = Boolean(referrer && new URL(referrer).origin === new URL(env.APP_URL).origin); } catch { /* malformed referrer fails closed */ }
    if (!user?.emailVerifiedAt || !sameOrigin) return new NextResponse("Sign in first", { status: 403 });
    userId = user.id;
  }
  const flow: LoginFlow = { provider, state: randomBytes(32).toString("base64url"), verifier: randomBytes(48).toString("base64url"), userId, next: safeLoginNext(url.searchParams.get("next")), expires: Date.now() + LOGIN_TTL * 1000 };
  const blog = validBlogSource(url.searchParams.get("blog"));
  if (!userId && blog) flow.blogSource = blog;
  (await cookies()).set(FLOW_COOKIE, sealLoginValue(flow, env.SESSION_SECRET), { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: LOGIN_TTL });
  return NextResponse.redirect(loginAuthorizeUrl(flow, `${env.APP_URL}/api/auth/federated/${provider}/callback`));
}
