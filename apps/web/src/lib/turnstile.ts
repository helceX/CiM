import "server-only";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

/**
 * Cloudflare Turnstile (a privacy-friendly CAPTCHA) on the forms that create
 * accounts or send email. It is OFF until both TURNSTILE_SITE_KEY and
 * TURNSTILE_SECRET_KEY are set in the environment, so local development, CI
 * and a fresh deploy behave exactly as before.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

/** The public site key to hand to the browser widget, or null when disabled. */
export function getTurnstileSiteKey(): string | null {
  return isTurnstileEnabled() ? (process.env.TURNSTILE_SITE_KEY ?? null) : null;
}

export async function verifyTurnstileToken(token: unknown, ip: string): Promise<boolean> {
  if (!isTurnstileEnabled()) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) return false;
  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY ?? "",
      response: token,
    });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Fail closed: if the check itself can't run, don't wave bots through.
    return false;
  }
}

/**
 * Route helper: returns a 400 response when the human check fails, or null
 * when the request may proceed. `body` is the parsed JSON request body.
 */
export async function rejectIfNotHuman(body: unknown, ip: string): Promise<NextResponse | null> {
  if (!isTurnstileEnabled()) return null;
  const token =
    body && typeof body === "object" ? (body as { turnstileToken?: unknown }).turnstileToken : undefined;
  if (await verifyTurnstileToken(token, ip)) return null;
  const e = await getTranslations("errors");
  return NextResponse.json({ error: e("captchaFailed"), code: "captcha_failed" }, { status: 400 });
}
