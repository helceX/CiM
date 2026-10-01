/**
 * Publishers whose content is sold by subscription and licensed commercially
 * (news agencies / wires). Reading their public feeds and re-selling the
 * result inside a paid product is exactly what their licences forbid, and they
 * enforce it quickly. A source on one of these domains is refused unless an
 * admin states in writing that Mediaory holds a licence from that agency.
 */
export const LICENSE_REQUIRED_DOMAINS: readonly string[] = [
  "aa.com.tr",
  "dha.com.tr",
  "iha.com.tr",
  "reuters.com",
  "apnews.com",
  "afp.com",
  "bloomberg.com",
];

/** Lower-cases and strips a leading "www." / trailing dot from a host name. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

export function hostOfUrl(url: string): string | null {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}

/** True for the domain itself and any subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = normalizeHost(host);
  const d = normalizeHost(domain);
  return h === d || h.endsWith(`.${d}`);
}

export function isLicenseRequiredHost(host: string): boolean {
  return LICENSE_REQUIRED_DOMAINS.some((domain) => hostMatchesDomain(host, domain));
}
