import { NextResponse } from "next/server";
import { z } from "zod";
import { countryCodesInScope, SOURCE_KINDS } from "@cim/core";
import { bulkSetSourcesCrawlEnabled, db } from "@cim/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../../auth";

const bodySchema = z.object({
  enabled: z.boolean(),
  /** "world", a continent code (EU, AS …) or an ISO country code. */
  region: z.string().regex(/^[A-Za-z]{2,5}$/).default("world"),
  /** Source-kind keys (news, blogs, forums …); empty = every kind. */
  /** An explicit selection (the rows currently shown after search/status filters). */
  ids: z.array(z.uuid()).max(1000).optional(),
  kinds: z.array(z.enum(SOURCE_KINDS.map((kind) => kind.key) as [string, ...string[]])).default([]),
});

/**
 * Pause or resume crawling for a whole slice of sources at once — everything
 * ("world", no kinds), or one country / continent, optionally only some kinds
 * of site. Never deletes anything; resuming skips blocked publishers.
 */
export async function POST(request: Request) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const limited = await checkRateLimit(`admin-sources-bulk:${auth.user.id}`, { limit: 30, windowSeconds: 60 });
  if (!limited.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const region = parsed.data.region === "world" ? "world" : parsed.data.region.toUpperCase();
  const countries = countryCodesInScope(region);
  const types = parsed.data.kinds.length
    ? SOURCE_KINDS.filter((kind) => parsed.data.kinds.includes(kind.key)).flatMap((kind) => [...kind.types])
    : undefined;

  const result = await bulkSetSourcesCrawlEnabled(
    db,
    parsed.data.ids
      ? { ids: parsed.data.ids }
      : { countries: countries ?? undefined, types },
    parsed.data.enabled,
  );
  return NextResponse.json({ ok: true, ...result });
}
