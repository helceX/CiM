import { z } from "zod";

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
});
export type AssistantAskInput = z.infer<typeof assistantAskSchema>;
