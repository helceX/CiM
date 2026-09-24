/**
 * docs/architecture/SECURITY.md "SSRF (brief §77, high priority — this
 * system fetches arbitrary URLs)". `packages/ingestion` fetches URLs
 * derived from configured Sources — outbound requests an attacker with
 * source-configuration access (or a redirect target under their control)
 * could otherwise steer at loopback, RFC1918/RFC4193 private ranges, or
 * a cloud metadata endpoint. Pure, exhaustively-testable classifier —
 * `safe-fetch.ts` is the only thing that should call it, and always
 * against the exact IP it is about to connect to (see that file's note
 * on resolve-then-connect).
 */

const IPV4_METADATA = "169.254.169.254";

/** IPv4 dotted-quad -> 4-byte tuple, or null if not a valid dotted-quad. */
function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes.push(n);
  }
  return bytes as [number, number, number, number];
}

function isBlockedIpv4([a, b]: [number, number, number, number]): boolean {
  if (a === 127) return true; // loopback (127.0.0.0/8)
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local, covers the cloud metadata address
  if (a === 0) return true; // "this network"
  if (a >= 224) return true; // multicast (224/4) + reserved (240/4)
  return false;
}

/**
 * IPv6 -> blocked ranges: ::1 (loopback), fe80::/10 (link-local),
 * fc00::/7 (RFC4193 unique local), ::ffff:0:0/96 (IPv4-mapped, recursed
 * into the IPv4 check so an attacker can't hide a private v4 address
 * inside a v6 literal).
 */
function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) {
    const v4 = parseIpv4(mapped[1]);
    return v4 ? isBlockedIpv4(v4) : true;
  }
  const firstGroup = normalized.split(":")[0] ?? "";
  if (/^fe[89ab][0-9a-f]$/.test(firstGroup)) return true; // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}$/.test(firstGroup)) return true; // fc00::/7 unique local
  return false;
}

/**
 * The single source of truth for "is this resolved IP address safe to
 * connect to" — everything else in this module and in safe-fetch.ts
 * defers to it.
 */
export function isBlockedIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return isBlockedIpv4(v4);
  if (ip.includes(":")) return isBlockedIpv6(ip);
  // Not a recognizable literal IP — fail closed rather than assume safe.
  return true;
}

export const METADATA_IP = IPV4_METADATA;

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

export function assertProtocolIsFetchable(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError(`Blocked non-HTTP(S) protocol: ${url.protocol}`);
  }
}
