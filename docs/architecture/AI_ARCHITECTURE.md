# AI Architecture

## Provider abstraction (ADR-003)

AI is never called directly from UI code or wired to one vendor's SDK
inline. `packages/ai` exposes a provider-agnostic interface:

```ts
interface AIProvider {
  generateSummary(input: SummaryInput): Promise<SummaryOutput>;
  classifySentiment(input: ClassifyInput): Promise<SentimentOutput>;
  extractEntities(input: ExtractInput): Promise<EntityOutput>;
  detectTopics(input: TopicInput): Promise<TopicOutput>;
  detectRisk(input: RiskInput): Promise<RiskOutput>;
  generateInsight(input: InsightInput): Promise<InsightOutput>;
  generateRecommendations(input: RecInput): Promise<RecommendationOutput>;
}
```

Every method's output is validated against a JSON schema (Zod) before
being trusted anywhere in the system — an invalid response triggers a
defined fallback (retry once, then mark the enrichment `failed` and show
"Not available"), never a best-effort guess passed through.

## AI is an enhancement layer, not the core (brief §92)

Ingestion, search, dashboards, alerts, and reports all function with AI
fields absent (`Not available` / `Unclassified`). If the AI provider is
down, mention volume, filtering, and delivery keep working — only
AI-derived fields (summary, sentiment, insight, recommendations) are
missing until enrichment catches up.

## Trust layer (brief §42–44)

Every AI-generated artifact a user sees carries, without exception:

- `summary` — the claim itself
- `evidence` — the specific Mentions/Articles/metrics it's based on
  (`InsightEvidence` rows)
- `sources` — links to the underlying content
- `confidence` — model/method-reported confidence, shown, not hidden
- `method` — what produced it (rule-based statistic vs. LLM synthesis vs.
  hybrid) so users can calibrate trust appropriately

An Insight with zero evidence rows cannot be rendered as a factual claim
in the UI — the rendering layer enforces this, it isn't just a backend
convention. "Why?" always resolves to the literal evidence set used.

## Hallucination controls (brief §43)

- Structured output only: every provider call requests/validates JSON
  matching a defined schema; free-text-only responses are not accepted
  for anything treated as data.
- Source content vs. AI interpretation are kept in visibly separate
  fields end-to-end (DB columns, API response shape, UI regions) — never
  merged into one opaque paragraph.
- The model is never asked to "fill in" unknown fields; unknown stays
  unknown (`Not available`), matching brief §95's platform-wide rule.

## Prompt injection defense (brief §126)

Fetched web/news content is untrusted input. Every AI prompt that
includes source content is structured in explicit, model-enforced
sections:

```
SYSTEM RULES      (fixed, not influenced by any request)
USER QUERY        (what the platform/user is asking for)
SOURCE CONTENT     (delimited, explicitly labeled untrusted, scraped)
```

Instructions found inside `SOURCE CONTENT` are never treated as system or
user instructions — this is enforced by prompt structure, not just
instruction (a "ignore previous instructions…" string inside an article
body must not change output schema, tool access, or behavior). Prompt
injection fixtures are part of the AI test suite (`TEST_STRATEGY.md`).

## Cost control (brief §91)

Pipeline runs cheap classification first (rule-based/lightweight model for
relevance and dedupe support), then topic detection, and reserves
expensive synthesis (executive summaries, recommendations) for what will
actually surface to a user (e.g. once per StoryCluster, not once per
duplicate Article). Responses are cached by `content_hash` so identical
content is never re-analyzed.

## Recommendations are never auto-applied (brief §44)

`generateRecommendations()` output is always presented as
Recommendation + Why + Evidence + Priority + Confidence for a human to
act on — the system never takes the recommended action automatically.

## Grounded, contextual assistant (brief §97–98)

The AI Assistant (Phase 2) is not a generic chatbot bolted onto the shell.
It receives the current screen's context (active filters, open
mention/report) as structured input and its answers follow the same
Answer / Evidence / Sources / Confidence / Actions shape as every other AI
surface — one trust contract across the product, not a separate one for
"chat".

## Roadmap note: AI Visibility (brief §46)

Tracking brand representation inside AI platforms (ChatGPT, Gemini,
Claude, Perplexity, Google AI search) is a distinct data domain (citations,
not crawled articles) and is explicitly Phase 3. The `Entity`/`Topic`
schema and navigation are kept generic enough that this becomes an
additional Insight/Mention *source type*, not a schema rewrite.
