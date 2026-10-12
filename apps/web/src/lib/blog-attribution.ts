import "server-only";
import { getBlogPost } from "../content/blog";
import { openLoginValue } from "./federated-login";

/** Aggregate acquisition only: no URL, IP, email or advertising identifier is retained. */
export function blogAttribution(raw: unknown, secret: string): Record<string, unknown> | undefined {
  if (typeof raw !== "string") return undefined;
  const value = openLoginValue<{ blogSource?: unknown; expires: number }>(raw, secret);
  if (typeof value?.blogSource !== "string" || value.blogSource.length > 120 || !getBlogPost(value.blogSource)) return undefined;
  return { acquisition: { channel: "blog", slug: value.blogSource } };
}
