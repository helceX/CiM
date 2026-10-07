import { NextResponse } from "next/server";
import { db, fillMissingSourceCountries } from "@cim/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../../auth";

/**
 * Gives every source with no country the one its web address points to (a .tr site → Türkiye, a .de site →
 * Germany), so it sits in the right country cluster and counts for a country-limited monitoring. Never overwrites
 * a country that is set; general endings (.com, .org, .io …) stay unknown.
 */
export async function POST() {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const limited = await checkRateLimit(`admin-sources-countries:${auth.user.id}`, { limit: 10, windowSeconds: 60 });
  if (!limited.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const result = await fillMissingSourceCountries(db);
  return NextResponse.json({ ok: true, ...result });
}
