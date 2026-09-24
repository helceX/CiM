"use client";

import { useState, type FormEvent } from "react";
import { Button, Input } from "@cim/ui";

type ConversationTurn = {
  question: string;
  answer: string;
  confidence: number;
  method: string;
  evidence: { id: string; title: string; sourceName: string }[];
};

// assistantAskSchema caps `history` at 10 turns; sending fewer, most-recent
// ones keeps every question answerable indefinitely (an ever-growing
// full-thread payload would eventually fail that cap with no way to
// recover short of a reload) and keeps the synthesis-tier AI call's
// context bounded as a conversation runs long.
const MAX_HISTORY_TURNS_SENT = 6;

// assistantAskSchema requires `question` to be at least 3 characters.
const MIN_QUESTION_LENGTH = 3;

/**
 * docs/architecture/AI_ARCHITECTURE.md "Grounded, contextual assistant"
 * (FEATURE_MATRIX.md P2 "AI Assistant (context-aware)", P3 "... multi-turn").
 * Same Answer/Evidence/Confidence trust contract as the "Since yesterday"
 * insight above it, now threaded across a conversation: each new question
 * sends every prior turn along so a follow-up ("what about the negative
 * ones?") can be grounded in what was just discussed. There's no
 * server-side chat-session store — the client resends the accumulated
 * turns with each question, capped at 10 by assistantAskSchema.
 * "Actions" is out of scope (docs/architecture/AI_ARCHITECTURE.md: the
 * system never takes a recommended action automatically), and "deeper
 * agentic workflows" (FEATURE_MATRIX.md's other P3 item alongside
 * multi-turn) stays unbuilt — this is Q&A, not a tool-calling loop.
 */
export function AiAssistantPanel() {
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    // Matches assistantAskSchema's own min(3) — without this, a 1-2
    // character question is submittable here but always server-rejected,
    // surfacing as a generic "Invalid input" with no explanation.
    if (trimmed.length < MIN_QUESTION_LENGTH || isAsking) return;
    setError(null);
    setIsAsking(true);
    try {
      const response = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          screenContext: "Viewing the Dashboard",
          history: turns
            .slice(-MAX_HISTORY_TURNS_SENT)
            .map((turn) => ({ question: turn.question, answer: turn.answer })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setTurns((prev) => [...prev, { question: trimmed, ...data }]);
      setQuestion("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Ask AI</h2>
      <p className="text-xs text-muted-foreground">
        Ask about your recent coverage — grounded in your own mentions, never a
        general-knowledge guess. Ask a follow-up any time; the conversation so
        far carries forward.
      </p>
      {turns.length > 0 ? (
        <ol className="mt-3 flex flex-col gap-3">
          {turns.map((turn, i) => (
            <li key={i} className="rounded-md bg-surface-muted p-3 text-sm">
              <p className="font-medium text-foreground">{turn.question}</p>
              <p className="mt-1 text-foreground">{turn.answer}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Confidence {Math.round(turn.confidence * 100)}%</span>
                <span>Method: {turn.method}</span>
              </div>
              {turn.evidence.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {turn.evidence.map((item) => (
                    <li key={item.id} className="text-xs text-muted-foreground">
                      &ldquo;{item.title}&rdquo; — {item.sourceName}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <form onSubmit={ask} className="mt-3 flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            turns.length > 0
              ? "Ask a follow-up…"
              : "e.g. What's the sentiment on our latest coverage?"
          }
          aria-label={turns.length > 0 ? "Ask a follow-up question" : "Ask the AI assistant a question"}
          disabled={isAsking}
        />
        <Button type="submit" disabled={isAsking || question.trim().length < MIN_QUESTION_LENGTH}>
          {isAsking ? "Asking…" : "Ask"}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
