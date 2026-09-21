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
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/monitoring",
  "/mentions",
  "/alerts",
  "/analytics",
  "/reports",
  "/settings",
  "/onboarding",
  "/admin",
];
const SESSION_COOKIE = "cim_session";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * docs/architecture/SECURITY.md brief §76 — CSRF protection on
 * state-changing requests, as defense-in-depth alongside the session
 * cookie's own `SameSite: lax` (already enough to stop the cookie
 * riding along on a cross-site POST, but a second, independent layer
 * costs little here). A real same-origin fetch() for a mutating method
 * always carries an Origin header per the Fetch spec — Referer is the
 * fallback for the rare client that doesn't — so anything with neither,
 * or a mismatched one, fails closed rather than being assumed safe.
 */
function isSameOriginRequest(request: NextRequest): boolean {
  const appOrigin = request.nextUrl.origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === appOrigin;

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === appOrigin;
    } catch {
      return false;
    }
  }
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && MUTATING_METHODS.has(request.method)) {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
    }
  }

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
  matcher: [
    "/dashboard/:path*",
    "/monitoring/:path*",
    "/mentions/:path*",
    "/alerts/:path*",
    "/analytics/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/admin/:path*",
    "/api/:path*",
  ],
};
