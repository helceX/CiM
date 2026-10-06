import { NextResponse } from "next/server";
import { z } from "zod";
import { countryInScope } from "@cim/core";
import { WORLD_SOURCE_CATALOG } from "@cim/core/world-catalog";
import { db, findExistingSourceUrls } from "@cim/db";
import { authorizeAdmin } from "../auth";

const querySchema = z.object({
  /** "world", "global" (no confirmed country), a continent code (EU, AS …) or an ISO country code. */
  region: z.string().regex(/^[A-Za-z]{2,6}$/).default("world"),
  group: z.string().regex(/^[a-z]{3,20}$/).optional(),
  q: z.string().trim().max(100).optional(),
  verified: z.enum(["1"]).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(2000).default(60),
});

/**
 * A page of the world catalog, filtered on the server so the admin screen never
 * ships thousands of rows to the browser. `limit` up to 2000 serves "test & add
 * everything that matches".
 */
export async function GET(request: Request) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { group, q, verified, offset, limit } = parsed.data;
  const region = parsed.data.region === "world" || parsed.data.region === "global" ? parsed.data.region : parsed.data.region.toUpperCase();
  const needle = q?.toLocaleLowerCase("tr");
  const inRegion = (country: string) =>
    region === "world" ? true : region === "global" ? country === "" : countryInScope(country, region);

  const matches = WORLD_SOURCE_CATALOG.filter((entry) => {
    if (!inRegion(entry.country)) return false;
    if (group && entry.group !== group) return false;
    if (verified && !entry.verified) return false;
    if (needle && !entry.name.toLocaleLowerCase("tr").includes(needle) && !entry.url.toLowerCase().includes(needle)) return false;
    return true;
  });

  // XML-checked feeds first, then alphabetical — a stable order so "show more" never repeats or skips.
  matches.sort((a, b) => Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name, "en") || a.key.localeCompare(b.key));
  const page = matches.slice(offset, offset + limit);
  const existing = await findExistingSourceUrls(db, page.map((entry) => entry.url));
  return NextResponse.json({
    total: matches.length,
    items: page.map((entry) => ({ ...entry, added: existing.has(entry.url) })),
  });
}
