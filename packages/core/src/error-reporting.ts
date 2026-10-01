/**
 * Minimal, dependency-free error reporting to Sentry (or any Sentry-compatible
 * server such as GlitchTip). It is OFF until a DSN is configured, so
 * development, CI and a fresh deploy send nothing anywhere.
 *
 * Deliberately not the full Sentry SDK: that hooks into the bundler and
 * auto-instruments HTTP/DB calls, which is more reach (and more risk of
 * capturing customer data) than we want. This sends one event per error with
 * the error's name, scrubbed message and stack, plus the tags the caller
 * passes — never request bodies, headers, cookies or query strings.
 */
export type ErrorReportingConfig = {
  dsn: string | undefined;
  service: string;
  environment?: string;
  release?: string;
};

type ParsedDsn = { endpoint: string; publicKey: string; dsn: string };

const MAX_EVENTS_PER_MINUTE = 30;
const SEND_TIMEOUT_MS = 3000;

let state: { parsed: ParsedDsn; config: ErrorReportingConfig } | null = null;
let windowStart = 0;
let windowCount = 0;

export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.split("/").filter(Boolean).pop();
    if (!url.username || !projectId || url.protocol !== "https:") return null;
    const prefix = url.pathname.slice(0, url.pathname.lastIndexOf("/" + projectId));
    return {
      endpoint: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/`,
      publicKey: url.username,
      dsn,
    };
  } catch {
    return null;
  }
}

/** Turns reporting on. A missing or malformed DSN leaves it off (never throws). */
export function configureErrorReporting(config: ErrorReportingConfig): boolean {
  state = null;
  if (!config.dsn) return false;
  const parsed = parseDsn(config.dsn);
  if (!parsed) {
    console.warn("[error-reporting] SENTRY_DSN is set but is not a valid https DSN — reporting stays off.");
    return false;
  }
  state = { parsed, config };
  return true;
}

export function isErrorReportingEnabled(): boolean {
  return state !== null;
}

/** Removes the obvious personal data / secrets that end up inside error text. */
export function scrubErrorText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/([?&](?:token|key|secret|code|password|api_key)=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/g, "$1[redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]");
}

function eventId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function buildEvent(
  error: unknown,
  config: ErrorReportingConfig,
  extra: Record<string, string | number | boolean | null | undefined> = {},
) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Non-error thrown");
  const { service, environment, release } = config;
  return {
    event_id: eventId(),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    environment: environment ?? "production",
    ...(release ? { release } : {}),
    tags: { service },
    extra: {
      ...extra,
      stack: err.stack ? scrubErrorText(err.stack).slice(0, 8000) : undefined,
    },
    exception: {
      values: [{ type: err.name || "Error", value: scrubErrorText(err.message).slice(0, 1000) }],
    },
  };
}

/**
 * Fire-and-forget: resolves once the attempt is over, never rejects, never
 * blocks the caller for more than a few seconds, and drops events beyond
 * 30/minute so a crash loop can't flood the account (or the event loop).
 */
export async function captureException(
  error: unknown,
  extra?: Record<string, string | number | boolean | null | undefined>,
): Promise<void> {
  if (!state) return;
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_EVENTS_PER_MINUTE) return;
  windowCount += 1;

  try {
    const { parsed, config } = state;
    const event = buildEvent(error, config, extra);
    const envelope = [
      JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn: parsed.dsn }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    await fetch(parsed.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=mediaory/1.0`,
      },
      body: envelope,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch {
    // Reporting must never be the thing that breaks the app.
  }
}

/** Test-only. */
export function __resetErrorReportingForTests(): void {
  state = null;
  windowStart = 0;
  windowCount = 0;
}
