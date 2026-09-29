# ADR-006: Social Listening Data Model & Match-Type Engine

## Status
Accepted

## Context

CiM V2's master prompt (§22–58, §118) asks for a social listening module:
typed match detection (direct mention, exact name, alias, hashtag, URL,
keyword-context, semantic), structured social authors, engagement
snapshots/velocity, cross-platform story propagation, and an "Unprompted
Brand Conversations" surface for semantic-only matches. §118 itself also
requires checking for an existing equivalent entity before adding a new
one. `docs/migration/CIM_V2_CHANGE_REPORT.md`'s audit found that several
of the requested primitives already exist under the existing
Article/Mention model (`DATA_MODEL.md`, ADR-004): `StoryCluster`
(`articles.storyClusterId`), engagement snapshots (`engagementMetrics`,
already has `observedAt`/`isEstimated`/`measurementMethod`), and entity
aliasing (`entities`/`entityAlias` from Phase 6). This ADR decides how
social content fits the existing model rather than forking a parallel one.

## Decision

### 1. Social content is `Article`, not a new top-level entity

A social post, exactly like a news article, is "content ingested by a
connector and matched against monitoring queries." `sources.type = social`
already exists as a value; `articles` already carries `sourceId`,
`canonicalUrl`, `publishedAt`, `storyClusterId`. Social posts flow through
the exact same pipeline (`INGESTION.md`) as news. No `SocialMention` or
`MediaItem` table is created — doing so would fork dedup, search
indexing, and story clustering into two parallel systems, which is the
exact failure mode ADR-004 already rejected ("per-source-type bespoke
pipelines").

### 2. `socialProfiles` is new — `articles.authorName` has no equivalent for structured author data

`articles.authorName` is a plain string; the master prompt's author
entity (§35: followers, verified, account type, engagement rate) has no
existing equivalent. New table:

```
socialProfiles
  id, platform, externalId, handle, displayName, profileUrl,
  followers, following, verified, accountType, language, country,
  avatarUrl, firstSeenAt, lastSeenAt
```

Global/reference data (not tenant-scoped), same pattern as `sources` and
`articles` — a profile is shared infrastructure; tenant-specific meaning
attaches via `Mention`, never by copying profile rows per tenant
(`DATA_MODEL.md` Conventions). `articles.authorProfileId` (nullable FK)
links an article to its author profile when the source is social; null
for non-social sources. Followers/engagement-rate absent from the source
→ `null`, rendered "Unknown" in UI, never a fabricated default (master
prompt §35, §182–184).

### 3. Match type is a typed column on `Mention`, not a new join table

`mentions.matchedTerms: text[]` exists but carries no taxonomy. Add:

```
mentions.matchType         text      -- direct_mention | exact_name | alias
                                      -- | hashtag | url | contextual | semantic
mentions.matchConfidence   numeric(4,3)   -- required when matchType = semantic
mentions.matchedRule       text      -- human-readable: which alias/hashtag/
                                      -- rule fired, for the "Why matched?" UI
```

`matchType` is nullable text (not a Postgres enum), matching the existing
convention on `alertRules.type` and `organizationMemberships.role` — new
values are a data change, not a migration. `matchConfidence` is required
(`NOT NULL` enforced in application code, not the schema, since existing
non-social exact matches legitimately have no confidence score) whenever
`matchType = 'semantic'` — a semantic match is never displayed without a
confidence indicator (master prompt §25, §57).

### 4. Semantic matching is an AI capability, gated by the existing trust layer

Semantic/"Unprompted Brand Conversations" detection (§26, §57) calls
`packages/ai`'s provider abstraction with a new `detectSemanticMention()`
method, following the exact system/user/source separation
`AI_ARCHITECTURE.md`'s trust layer already enforces for `detectRisk`/
`generateRecommendations` — social post text is `SOURCE DATA`, never
promoted into system instructions, regardless of what it contains (master
prompt §61, §111). A semantic match without an `InsightEvidence`-style
record of what concept/entity triggered it cannot render as "matched" —
same evidence-mandatory rule as `Insight` (`DATA_MODEL.md`).

### 5. Engagement velocity is a query over existing `engagementMetrics`, not a new table

`engagementMetrics` already stores point-in-time observations
(`observedAt`, per `metricType`). Velocity (§32–33) is computed as a
rate-of-change over existing rows for the same `articleId` +
`metricType`, not a new snapshot table. `metricType` vocabulary extends
to platform-native values (likes, reposts, quotes, saves) as connectors
are implemented; absence of a row for a type still means "Not available."

### 6. Cross-platform propagation reuses `storyClusterId`

"Potential propagation path" (§38) is a query that orders an
`articles.storyClusterId` group by `fetchedAt`/`publishedAt` across
platforms — explicitly presented as a possible/observed sequence, never a
claimed causal chain (master prompt §38 is explicit: "Bu kesin
neden-sonuç ilişkisi olarak gösterilmemeli"). No new relationship table.

### 7. Connector types extend the existing `SourceConnector` interface (ADR-004)

`SocialConnector`/`YouTubeConnector` were already named as Phase 3 slots
in `INGESTION.md` before this ADR existed. `MockSocialConnector` ships
first, mirroring `MockNewsConnector`'s existing role (full UX/E2E
testable without live platform APIs). Real platform connectors follow
master prompt §28–29: official API first; a connector unable to reach a
capability legitimately reports `PROVIDER_REQUIRED`/`UNAVAILABLE` via a
new `capabilities` field on `sources`, never silently substitutes fake
data.

## Alternatives considered

- **Separate `SocialMention`/`MediaItem` table, parallel to `Article`/
  `Mention`.** Rejected — this is what the master prompt's own §118
  warns against duplicating, and would fork search indexing, dedup, and
  story clustering into two systems that must stay in sync forever.
- **Graph database for source→story→mention→author→engagement
  relationships (§121).** Rejected for this phase — master prompt §121
  itself says a relational model with relationship tables is sufficient
  for the first version; revisit only if query patterns prove it isn't.

## Consequences

- Existing Mention/Article consumers (Mentions list, Analytics, Reports,
  Alerts, AI enrichment) get social content "for free" — no separate
  social pipeline to keep feature-parity with over time.
- `matchType`/`matchConfidence`/`matchedRule` being nullable means
  non-social, non-monitoring-query-match historical mentions render
  "Not classified" rather than requiring a backfill migration.
- Any future social-specific query pattern (e.g. platform-only
  aggregation) is a `WHERE sources.type = 'social'` join, not a separate
  read path — this is deliberately not optimized away until proven
  necessary, per `ARCHITECTURE.md`'s "no package/table until a second
  real consumer needs it."
