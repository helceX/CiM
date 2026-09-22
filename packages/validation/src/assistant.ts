import { z } from "zod";

/**
 * docs/product/FEATURE_MATRIX.md P3 "AI Assistant: ... multi-turn" — the
 * client resends the conversation so far with each new question (this
 * app has no server-side chat-session store); capped the same way
 * `question`/`answer` fields elsewhere in this codebase are, so a client
 * can't force an unbounded prompt onto the synthesis-tier AI call.
 */
const conversationTurnSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(1200),
});

/**
 * docs/architecture/AI_ARCHITECTURE.md "Grounded, contextual assistant"
 * (FEATURE_MATRIX.md P2 "AI Assistant (context-aware)"). `screenContext`
 * is a short, server-trusted-enough label the caller supplies describing
 * what the user was looking at (e.g. "Viewing the Dashboard") — informational
 * framing for the model, not something granting any extra access.
 */
export const assistantAskSchema = z.object({
  question: z.string().trim().min(3).max(500),
  screenContext: z.string().trim().max(200).default("Viewing the Dashboard"),
  history: z.array(conversationTurnSchema).max(10).default([]),
});
export type AssistantAskInput = z.infer<typeof assistantAskSchema>;
