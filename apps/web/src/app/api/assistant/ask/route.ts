import { NextResponse } from "next/server";
import { getAIProvider } from "@cim/ai";
import { getEnv } from "@cim/config";
import { db, listRecentMentionsForAssistant } from "@cim/db";
import { assistantAskSchema } from "@cim/validation";
import { requireOrgContext } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * docs/architecture/AI_ARCHITECTURE.md "Grounded, contextual assistant" —
 * a real synthesis-tier AI call per question (like report generation's
 * headless-Chromium render), so it's rate-limited per organization on top
 * of the auth requirement, the same discipline apps/web/src/app/api/
 * reports/route.ts applies for the same reason.
 */
export async function POST(request: Request) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(`assistant-ask:${context.organizationId}`, {
    limit: 20,
    windowSeconds: 10 * 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many questions asked. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = assistantAskSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const provider = getAIProvider(getEnv());
  if (!provider) {
    return NextResponse.json(
      { error: "The AI Assistant isn't available right now." },
      { status: 503 },
    );
  }

  const mentions = await listRecentMentionsForAssistant(db, context.organizationId, {
    limit: 30,
  });

  let result;
  try {
    result = await provider.answerQuestion({
      question: parsed.data.question,
      screenContext: parsed.data.screenContext,
      mentions,
    });
  } catch (error) {
    console.error("[assistant] answerQuestion failed:", error);
    return NextResponse.json(
      { error: "The AI Assistant couldn't answer that just now. Try again." },
      { status: 502 },
    );
  }

  // Resolve the model's evidence ids back to the grounding rows for
  // display — result.evidenceMentionIds is already filtered to real
  // candidates at the provider layer (never a fabricated id), same
  // guarantee generateInsight gives its own caller.
  const mentionById = new Map(mentions.map((m) => [m.id, m]));
  const evidence = result.evidenceMentionIds
    .map((id) => mentionById.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => ({ id: m.id, title: m.title, sourceName: m.sourceName }));

  return NextResponse.json({
    answer: result.answer,
    confidence: result.confidence,
    method: result.method,
    evidence,
  });
}
