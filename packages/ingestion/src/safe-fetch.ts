import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { isBlockedIp, assertProtocolIsFetchable, SsrfBlockedError } from "./ssrf-guard";

export { SsrfBlockedError } from "./ssrf-guard";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

type ResolvedAddress = { address: string; family: number };

/**
 * The one place `dns.lookup` is actually called. Resolves every address a
 * hostname maps to and requires ALL of them to be safe, not just one —
 * an attacker who controls a DNS record they know we'll check could
 * otherwise return a mix and hope Node's own connection logic picks the
 * unsafe one.
 */
async function resolveValidatedIp(hostname: string): Promise<ResolvedAddress> {
  const results = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses);
    });
  });
  if (results.length === 0) {
    throw new SsrfBlockedError(`DNS resolution returned no addresses for "${hostname}"`);
  }
  for (const result of results) {
    if (isBlockedIp(result.address)) {
      throw new SsrfBlockedError(`Blocked address for "${hostname}": ${result.address}`);
    }
  }
  const first = results[0]!;
  return { address: first.address, family: first.family };
}

/**
 * Every real connection made by `safeFetch` goes through this — the
 * `lookup` we hand to undici's connector always returns the address we
 * already validated, never triggers a second DNS lookup. That's the
 * resolve-then-connect discipline docs/architecture/SECURITY.md calls
 * for: whatever IP we checked is the IP we connect to, closing the
 * DNS-rebinding window a "check now, resolve again later" approach leaves
 * open.
 */
function pinnedLookup(resolved: ResolvedAddress) {
  return (
    _hostname: string,
    lookupOptions: { all?: boolean },
    callback: (
      err: Error | null,
      addressOrAddresses: string | { address: string; family: number }[],
      family?: number,
    ) => void,
  ) => {
    // Node's `net.connect` defaults to Happy-Eyeballs (`autoSelectFamily`),
    // which calls a custom `lookup` with `{ all: true }` and expects an
    // array back — the scalar `(err, address, family)` form is only for
    // the legacy single-address path. Both forms return the exact same
    // pre-validated address; there is never a second, unvalidated one to
    // choose between.
    if (lookupOptions.all) {
      callback(null, [{ address: resolved.address, family: resolved.family }]);
    } else {
      callback(null, resolved.address, resolved.family);
    }
  };
}

async function readBodyWithCap(response: Awaited<ReturnType<typeof undiciFetch>>, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new SsrfBlockedError(`Response exceeded the ${maxBytes}-byte cap`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
  headers?: Record<string, string>;
  /** Test-only injection point — defaults to the real DNS-backed resolver. */
  resolveHostname?: (hostname: string) => Promise<ResolvedAddress>;
};

export type SafeFetchResult = {
  status: number;
  headers: Awaited<ReturnType<typeof undiciFetch>>["headers"];
  body: string;
  finalUrl: string;
};

/**
 * docs/architecture/INGESTION.md "Fetch — connector-specific;
 * SSRF-guarded... No redirect-follow that isn't itself re-validated
 * against the same rules." Used by every connector that reaches the
 * open internet (RSS/Sitemap/Web) — never call the global `fetch`
 * directly from a connector.
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const resolveHostname = options.resolveHostname ?? resolveValidatedIp;

  let currentUrl = new URL(url);
  for (let hop = 0; ; hop += 1) {
    assertProtocolIsFetchable(currentUrl);
    const resolved = await resolveHostname(currentUrl.hostname);
    const agent = new Agent({ connect: { lookup: pinnedLookup(resolved), timeout: timeoutMs } });

    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(currentUrl, {
        redirect: "manual",
        headers: { "user-agent": "CiM-Bot/1.0 (+monitoring)", ...options.headers },
        dispatcher: agent,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } finally {
      await agent.close();
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SsrfBlockedError(`Redirect response (${response.status}) with no Location header`);
      }
      if (hop >= maxRedirects) {
        throw new SsrfBlockedError(`Too many redirects (max ${maxRedirects})`);
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    const body = await readBodyWithCap(response, maxResponseBytes);
    return { status: response.status, headers: response.headers, body, finalUrl: currentUrl.toString() };
  }
}
