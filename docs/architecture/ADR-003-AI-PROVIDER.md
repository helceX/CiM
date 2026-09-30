# ADR-003: AI Provider Abstraction

## Status
Accepted

## Context
AI is used across classification, summarization, entity/topic extraction,
risk detection, and insight/recommendation generation. Vendor lock-in,
model deprecation, and provider outages are real operational risks, and
the brief requires the core product to keep functioning if AI is
unavailable (§92).

## Decision
- Define `AIProvider` in `packages/ai` (see `AI_ARCHITECTURE.md` for the
  exact interface) as the only surface application code depends on. No
  UI component, API route, or worker job calls a vendor SDK directly.
- Every provider response is validated against a Zod schema before use;
  invalid/unparseable output triggers a fallback, never a passthrough.
- AI enrichment is asynchronous and optional at the data-model level —
  `Mention`/`Article`/`Insight` rows exist and function with AI fields
  null/pending; nothing in ingestion, search, alerting or core dashboards
  blocks on AI availability.
- Model/vendor choice is a configuration concern (env-driven provider
  selection), not a code-path concern — swapping providers or running
  a second provider for a specific capability (e.g. cheaper classifier vs.
  higher-quality synthesis model) does not require touching call sites.
- Cost-tiering is part of the abstraction's usage pattern, not the
  interface shape: callers choose cheap-classification vs.
  expensive-synthesis methods explicitly (see `AI_ARCHITECTURE.md` cost
  control), rather than the interface silently picking a model tier.

## Alternatives considered
- **Direct SDK calls per feature.** Fastest to write initially, but
  couples business logic to one vendor's request/response shape
  everywhere it's used, makes provider outages a scattered failure mode
  instead of one fallback path, and makes prompt-injection defense
  inconsistent across call sites. Rejected.
- **A single mega-prompt agent framework.** Rejected for MVP —
  unnecessary complexity versus the specific, well-bounded AI operations
  this product actually needs (summarize, classify, extract, detect,
  insight, recommend). Revisit only if/when the AI Assistant (Phase 2)
  needs actual multi-step tool-use orchestration.

## Consequences
- Every new AI capability needs a schema-validated method added to the
  interface, not an ad hoc prompt call inline in a route/component.
- Provider selection, keys, and per-capability model choice are
  configuration (`packages/config`), documented in `.env.example`, never
  hardcoded.
