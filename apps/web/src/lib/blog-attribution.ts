import "server-only";
import { getBlogPost } from "../content/blog";
import { openLoginValue } from "./federated-login";

export function validBlogSource(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 120 && (value === "blog-library" || getBlogPost(value)) ? value : undefined;
}

/** Aggregate acquisition only: no URL, IP, email or advertising identifier is retained. */
export function blogAttribution(raw: unknown, secret: string): Record<string, unknown> | undefined {
  if (typeof raw !== "string") return undefined;
  const value = openLoginValue<{ blogSource?: unknown; expires: number }>(raw, secret);
  const source = validBlogSource(value?.blogSource);
  return source ? { acquisition: { channel: "blog", slug: source } } : undefined;
}
