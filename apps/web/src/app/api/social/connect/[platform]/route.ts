import { NextResponse } from "next/server";
import { getEnv } from "@cim/config";
import { getSocialProvider } from "@cim/ingestion";
import { requirePermission } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
  callbackUrl,
  newPkce,
  newState,
  sealTransaction,
} from "@/lib/social-oauth";

/**
 * Step 1 of linking your own account: send the person to the platform's own
 * consent screen. Only an owner/admin may link an account for the organization,
 * and only a platform the operator has configured can be started.
 */
export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const settingsUrl = (query: string) => new URL(`/settings?${query}#connected-accounts`, request.url);

  let context;
  try {
    context = await requirePermission("org:manage_settings");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") return NextResponse.redirect(settingsUrl("social=forbidden"));
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const provider = getSocialProvider(platform);
  const env = getEnv();
  if (!provider || !provider.isConfigured(process.env)) return NextResponse.redirect(settingsUrl("social=unavailable"));

  const limited = await checkRateLimit(`social-connect:${context.userId}`, { limit: 20, windowSeconds: 3600 });
  if (!limited.allowed) return NextResponse.redirect(settingsUrl("social=slow-down"));

  const { verifier, challenge } = newPkce();
  const state = newState();
  const response = NextResponse.redirect(
    provider.authorizeUrl({
      env: process.env,
      redirectUri: callbackUrl(env.APP_URL, provider.key),
      state,
      codeChallenge: challenge,
    }),
  );
  response.cookies.set(
    OAUTH_COOKIE,
    sealTransaction(
      {
        platform: provider.key,
        state,
        verifier,
        userId: context.userId,
        organizationId: context.organizationId,
        expiresAt: Date.now() + OAUTH_COOKIE_MAX_AGE_SECONDS * 1000,
      },
      env.SESSION_SECRET,
    ),
    { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax", path: "/api/social", maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS },
  );
  return response;
}
