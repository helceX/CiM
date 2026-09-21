import { NextResponse, type NextRequest } from "next/server";

/**
 * Cookie-presence check only — a fast, edge-safe redirect for UX. The
 * actual authorization decision (is this session valid/not-revoked, does
 * it resolve to an organization) always happens server-side again in
 * getCurrentUser()/getOrgContext() (ADR-001, ADR-005) before any data is
 * read or written; this proxy is not the security boundary.
 *
 * Next.js 16.3 renamed the "middleware" file convention to "proxy" — see
 * https://nextjs.org/docs/messages/middleware-to-proxy. Same API, new
 * file/export name; this project follows the current convention rather
 * than the deprecated one.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/onboarding"];
const SESSION_COOKIE = "cim_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/onboarding/:path*"],
};
