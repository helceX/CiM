import { NextResponse } from "next/server";
import { visualSpecSchema } from "@cim/validation";
import { db, runVisual } from "@cim/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorize } from "../auth";

/** Live preview for the builder: runs an unsaved spec. Rate-limited per organization. */
export async function POST(request: Request) {
  const auth = await authorize("monitoring:read");
  if (auth.response) return auth.response;
  const { context } = auth;

  const limit = await checkRateLimit(`visual-preview:${context.organizationId}`, { limit: 60, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many previews. Try again in a minute." }, { status: 429 });
  }

  const parsed = visualSpecSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    return NextResponse.json(await runVisual(db, context.organizationId, parsed.data));
  } catch (error) {
    console.error("[visuals] preview failed:", error);
    return NextResponse.json({ error: "This visual could not be computed. Try a shorter period." }, { status: 500 });
  }
}
