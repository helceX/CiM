import { NextResponse } from "next/server";
import { createSourceSchema } from "@cim/validation";
import { createSource, db } from "@cim/db";
import { testSourceUrl } from "@/lib/source-test";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeAdmin } from "../auth";

/**
 * Adds a crawl source. The feed is fetched and parsed first and nothing is
 * stored unless it yields items, so the sources list only ever contains
 * feeds that were readable when they were added.
 */
export async function POST(request: Request) {
  const auth = await authorizeAdmin();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`admin-source-create:${auth.user.id}`, {
    limit: 60,
    windowSeconds: 60 * 10,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const parsed = createSourceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid source." },
      { status: 400 },
    );
  }

  const test = await testSourceUrl(parsed.data.url, parsed.data.connector);
  if (!test.ok) {
    return NextResponse.json({ error: test.message }, { status: 422 });
  }

  const result = await createSource(db, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "duplicate" ? "This address is already a source." : "Invalid address." },
      { status: result.reason === "duplicate" ? 409 : 400 },
    );
  }
  return NextResponse.json({ ok: true, id: result.id, itemCount: test.itemCount }, { status: 201 });
}
