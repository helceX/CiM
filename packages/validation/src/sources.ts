import { z } from "zod";

/** Source types an operator may create by hand — the connectors that really exist. */
export const ADMIN_SOURCE_TYPES = ["news", "press", "blog", "website", "forum"] as const;
export const ADMIN_SOURCE_CONNECTORS = ["rss", "sitemap"] as const;

const httpsUrl = z
  .url()
  .max(2000)
  .refine((value) => value.startsWith("https://"), "Use an https:// address");

/**
 * A crawl source added by a platform admin. Policy flags are deliberately not
 * accepted: every hand-added source stores titles/excerpts only, never full text.
 */
export const createSourceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  url: httpsUrl,
  connector: z.enum(ADMIN_SOURCE_CONNECTORS).default("rss"),
  type: z.enum(ADMIN_SOURCE_TYPES).default("news"),
  language: z.enum(["tr", "en"]).default("tr"),
  country: z.string().trim().length(2).toUpperCase().default("TR"),
});
export type CreateSourceInput = z.infer<typeof createSourceSchema>;

export const testSourceSchema = z.object({
  url: httpsUrl,
  connector: z.enum(ADMIN_SOURCE_CONNECTORS).default("rss"),
});
export type TestSourceInput = z.infer<typeof testSourceSchema>;
