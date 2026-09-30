export type OriginInput = {
  origin: string | null;
  referer: string | null;
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
  /** request.nextUrl.origin — unreliable behind a proxy, see trustedOrigins. */
  nextOrigin: string;
  /** Origin of the configured public URL (APP_URL), if set. */
  appUrl: string | undefined;
};

function first(value: string | null): string | null {
  const head = value?.split(",")[0]?.trim();
  return head ? head : null;
}

/**
 * Every origin a genuine same-site browser request may legitimately carry.
 *
 * request.nextUrl.origin alone is not enough: Next's standalone server
 * (`node server.js` with HOSTNAME=0.0.0.0, as in apps/web/Dockerfile)
 * reports http://0.0.0.0:<port> regardless of the Host header, so behind
 * a TLS-terminating proxy (Railway/Cloudflare → https://mediaory.io) it
 * never equals the Origin header and every mutating API call — login and
 * registration included — was rejected with 403. The public origin is
 * therefore rebuilt from the forwarded/Host headers, and the configured
 * APP_URL is trusted as well. A cross-site page cannot forge Origin, Host
 * or X-Forwarded-* from a victim's browser, so this keeps the check meaningful.
 */
export function trustedOrigins(input: OriginInput): Set<string> {
  const trusted = new Set<string>([input.nextOrigin]);

  const host = first(input.forwardedHost) ?? first(input.host);
  if (host) {
    const proto = first(input.forwardedProto) ?? new URL(input.nextOrigin).protocol.replace(":", "");
    trusted.add(`${proto}://${host}`);
  }

  if (input.appUrl) {
    try {
      trusted.add(new URL(input.appUrl).origin);
    } catch {
      // A malformed APP_URL simply contributes nothing.
    }
  }
  return trusted;
}

export function isSameOrigin(input: OriginInput): boolean {
  const trusted = trustedOrigins(input);
  if (input.origin) return trusted.has(input.origin);

  if (input.referer) {
    try {
      return trusted.has(new URL(input.referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}
