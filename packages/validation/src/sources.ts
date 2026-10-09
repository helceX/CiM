import { z } from "zod";

/** Source types an operator may create by hand — the connectors that really exist. */
export const ADMIN_SOURCE_TYPES = ["news", "newspaper", "magazine", "press", "blog", "website", "forum", "comments", "social", "youtube", "podcast", "trends"] as const;
export const ADMIN_SOURCE_CONNECTORS = ["rss", "sitemap", "api", "google-trends"] as const;

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
  // ISO 639 code ("tr", "en", "pt", "zh" …) or "other"; the world catalog carries many languages.
  language: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^([a-z]{2,3}|other)$/, "Use a language code such as tr, en or pt")
    .default("tr"),
  // "ZZ" = no country (a global social feed); stored as null.
  country: z.string().trim().length(2).toUpperCase().default("TR"),
  licenseConfirmed: z.boolean().default(false),
  // Only for connector "api" (a JSON clipping/data provider): the key sent on every request.
  apiKey: z.string().trim().min(8).max(500).optional(),
  apiKeyHeaderName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,60}$/, "Header names use letters, digits and dashes")
    .optional(),
});
export type CreateSourceInput = z.infer<typeof createSourceSchema>;

export const testSourceSchema = z.object({
  url: httpsUrl,
  connector: z.enum(ADMIN_SOURCE_CONNECTORS).default("rss"),
  apiKey: z.string().trim().min(8).max(500).optional(),
  apiKeyHeaderName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,60}$/)
    .optional(),
});
export type TestSourceInput = z.infer<typeof testSourceSchema>;

/** What a publisher submits on the public takedown form. */
export const takedownRequestSchema = z.object({
  requesterName: z.string().trim().min(1, "Your name is required").max(120),
  requesterEmail: z.email().max(255).toLowerCase(),
  publisher: z.string().trim().min(1, "Publisher or site name is required").max(200),
  targets: z.string().trim().min(3, "Tell us which site or pages").max(1000),
  message: z.string().trim().max(2000).default(""),
  // The requester states they may act for the publisher.
  confirmAuthority: z.literal(true, { error: "Please confirm you can act for this publisher" }),
});
export type TakedownRequestInput = z.infer<typeof takedownRequestSchema>;

const domainSchema = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .transform((value) => value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
  .refine((value) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value), "Enter a domain like example.com");

export const blockDomainSchema = z.object({
  domain: domainSchema,
  reason: z.string().trim().min(1, "A reason is required").max(500),
  purge: z.boolean().default(false),
});

export const resolveTakedownSchema = z.object({
  action: z.enum(["block_and_purge", "block", "resolve", "reject"]),
  note: z.string().trim().max(1000).default(""),
  // Needed for the two block actions: the domain to block.
  domain: domainSchema.optional(),
});
