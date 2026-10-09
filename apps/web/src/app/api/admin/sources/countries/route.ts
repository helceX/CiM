import { NextResponse } from "next/server";
import { db, fillMissingSourceCountries } from "@cim/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../../auth";

/**
 * Classifies uncategorized sources by explicit Turkish language and name/feed signals first, then a country-specific
 * top-level domain. Never overwrites a country that is already set; weak endings such as .com and .org stay unknown.
 */
export async function POST() {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const limited = await checkRateLimit(`admin-sources-countries:${auth.user.id}`, { limit: 10, windowSeconds: 60 });
  if (!limited.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const result = await fillMissingSourceCountries(db);
  return NextResponse.json({ ok: true, ...result });
}
