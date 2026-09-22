"use client";

import { useState, type FormEvent } from "react";
import { Button, Input } from "@cim/ui";

type AssistantAnswer = {
  answer: string;
  confidence: number;
  method: string;
  evidence: { id: string; title: string; sourceName: string }[];
};

/**
 * docs/architecture/AI_ARCHITECTURE.md "Grounded, contextual assistant"
 * (FEATURE_MATRIX.md P2 "AI Assistant (context-aware)") — same Answer /
 * Evidence / Confidence trust contract as the "Since yesterday" insight
 * above it; "Actions" is out of scope (docs/architecture/
 * AI_ARCHITECTURE.md: the system never takes a recommended action
 * automatically, and recommendations themselves are still unbuilt P2
 * scope — there's nothing to offer yet).
 */
export function AiAssistantPanel() {
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistantAnswer | null>(null);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || isAsking) return;
    setError(null);
    setIsAsking(true);
    try {
      const response = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, screenContext: "Viewing the Dashboard" }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResult(data);
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Ask AI</h2>
      <p className="text-xs text-muted-foreground">
        Ask about your recent coverage — grounded in your own mentions, never a
        general-knowledge guess.
      </p>
      <form onSubmit={ask} className="mt-3 flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What's the sentiment on our latest coverage?"
          aria-label="Ask the AI assistant a question"
          disabled={isAsking}
        />
        <Button type="submit" disabled={isAsking || !question.trim()}>
          {isAsking ? "Asking…" : "Ask"}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-3 rounded-md bg-surface-muted p-3 text-sm">
          <p className="text-foreground">{result.answer}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Confidence {Math.round(result.confidence * 100)}%</span>
            <span>Method: {result.method}</span>
          </div>
          {result.evidence.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {result.evidence.map((item) => (
                <li key={item.id} className="text-xs text-muted-foreground">
                  &ldquo;{item.title}&rdquo; — {item.sourceName}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
