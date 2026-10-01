import { NextResponse } from "next/server";
import { getEnv } from "@cim/config";
import { asOrganizationId, db, recordAuditLog, saveSocialConnection } from "@cim/db";
import { encryptSecret, getSocialProvider, tokenSecretFromEnv } from "@cim/ingestion";
import { requirePermission } from "@/lib/tenant";
import { OAUTH_COOKIE, callbackUrl, openTransaction } from "@/lib/social-oauth";

/**
 * Step 2: the platform sends the person back with a one-time code. It is only
 * honoured when the signed cookie from step 1 matches (state, platform, the
 * same signed-in person and organization); the resulting tokens are sealed
 * before they touch the database.
 */
export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const back = (query: string) => {
    const response = NextResponse.redirect(new URL(`/settings?${query}#connected-accounts`, request.url));
    response.cookies.set(OAUTH_COOKIE, "", { path: "/api/social", maxAge: 0 });
    return response;
  };

  let context;
  try {
    context = await requirePermission("org:manage_settings");
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const env = getEnv();
  const url = new URL(request.url);
  const cookieValue = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${OAUTH_COOKIE}=`))
    ?.slice(OAUTH_COOKIE.length + 1);
  const transaction = openTransaction(cookieValue, env.SESSION_SECRET);

  if (
    !transaction ||
    transaction.platform !== platform ||
    transaction.state !== url.searchParams.get("state") ||
    transaction.userId !== context.userId ||
    transaction.organizationId !== context.organizationId
  ) {
    return back("social=expired");
  }
  if (url.searchParams.get("error")) return back("social=denied");
  const code = url.searchParams.get("code");
  const provider = getSocialProvider(platform);
  if (!code || !provider || !provider.isConfigured(process.env)) return back("social=failed");

  try {
    const { tokens, account } = await provider.exchangeCode({
      env: process.env,
      code,
      redirectUri: callbackUrl(env.APP_URL, provider.key),
      codeVerifier: transaction.verifier,
      fetch,
    });
    const secret = tokenSecretFromEnv(process.env);
    const saved = await saveSocialConnection(db, asOrganizationId(context.organizationId), {
      platform: provider.key,
      externalAccountId: account.externalId,
      handle: account.handle,
      displayName: account.displayName,
      profileUrl: account.profileUrl,
      avatarUrl: account.avatarUrl,
      accessTokenEnc: encryptSecret(tokens.accessToken, secret),
      refreshTokenEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken, secret) : null,
      scopes: tokens.scopes,
      tokenExpiresAt: tokens.expiresAt ?? null,
      connectedByUserId: context.userId,
    });
    await recordAuditLog(db, context.organizationId, {
      actorUserId: context.userId,
      action: "social.connected",
      targetType: "social_connection",
      targetId: saved.id,
      metadata: { platform: provider.key, handle: account.handle },
    });
    return back("social=connected");
  } catch (error) {
    console.error(`[web] social connect (${platform}) failed:`, error instanceof Error ? error.message : error);
    return back("social=failed");
  }
}
