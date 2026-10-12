import "server-only";
import { getBlogPost } from "../content/blog";
import { LOGIN_TTL, openLoginValue, sealLoginValue } from "./federated-login";

export function validBlogSource(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 120 && (value === "blog-library" || getBlogPost(value)) ? value : undefined;
}

export function sealBlogAttribution(source: string, secret: string): string {
  // Public measurement claims cannot be replayed as an OAuth flow or identity cookie.
  return sealLoginValue({ blogSource: source, expires: Date.now() + LOGIN_TTL * 1000 }, `blog-attribution:${secret}`);
}

/** Aggregate acquisition only: no URL, IP, email or advertising identifier is retained. */
export function blogAttribution(raw: unknown, secret: string): Record<string, unknown> | undefined {
  if (typeof raw !== "string") return undefined;
  const value = openLoginValue<{ blogSource?: unknown; expires: number }>(raw, `blog-attribution:${secret}`);
  const source = validBlogSource(value?.blogSource);
  return source ? { acquisition: { channel: "blog", slug: source } } : undefined;
}
