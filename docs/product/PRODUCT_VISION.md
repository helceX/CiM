# Product Vision — CiM (Communication Intelligence Platform)

## What this is

CiM is a multi-tenant Media / Communication Intelligence SaaS for corporate
communications, PR, brand, reputation, and agency teams. It replaces manual
tracking of news, web, and social mentions with one continuous loop:

```
watch → filter → discover → understand → alert → analyze → report → recommend
```

It is **not** a news aggregator and **not** a simple keyword-alert tool. Every
feature must answer, faster than the alternative of manual monitoring, one
question: *"What happened about us today, why does it matter, and what
should I look at right now?"*

## Guiding principle (the one that overrides all others)

> Does this feature bury the user in more data, or help them understand the
> right information faster?

Every feature must serve the second. Feature count is not a success metric;
time-to-understanding is.

## Product character

- **Powerful but easy.** No onboarding manual required for core use.
  Advanced features (Boolean search, custom alert rules, API, webhooks,
  report builder, AI configuration) exist but are revealed progressively —
  simple UI by default, advanced surfaces opened on demand.
- **Grounded AI.** AI never states a fact without evidence, source links,
  and a confidence indicator. It is an analysis layer on top of real data,
  never a replacement for it. See `AI_ARCHITECTURE.md` and the AI Trust
  Layer.
- **Honest data.** If a number (reach, engagement, sentiment, value) cannot
  be computed from real source data, the UI says "Not available" —  it is
  never fabricated or estimated silently.
- **Enterprise-quiet visual language.** Minimal, neutral, data-first. No
  emoji, no gradients, no glassmorphism, no "AI aesthetic" (purple glow,
  sparkles, chat bubbles). See `docs/ux/DESIGN_SYSTEM.md`.

## Core entity hierarchy

```
Organization → Workspace → Project → Monitoring Query → Mentions
                                                        → Alerts
                                                        → Reports
                                                        → Insights
```

Every organization is a fully isolated tenant (see ADR-001).

## Primary users and jobs-to-be-done

| Role | Core job |
|---|---|
| Organization Owner / Admin | Configure org, manage members, billing-readiness, security |
| Communications Manager | Monitor brand/topics, manage alerts, run reports |
| Analyst | Deep-dive mentions, build queries, tune sources, investigate |
| Executive (CEO/CMO) | Read executive brief, critical alerts, share of voice |
| Viewer | Read dashboards/reports, no configuration |
| Report Recipient | Receive/view only the reports shared with them |

Dashboards share one dataset but present different information hierarchy per
role (see `USER_FLOWS.md` and `docs/ux/INFORMATION_ARCHITECTURE.md`).

## The core experience (target daily loop)

1. Open dashboard → "Since yesterday" executive brief.
2. See important/critical alerts.
3. Read AI "what changed" summary (with evidence).
4. Scan Top Stories.
5. Open a story → see related coverage, reach/engagement, AI insight.
6. Assign a mention to a teammate if action is needed.
7. Daily report/digest is already waiting, generated automatically.

If a build decision doesn't shorten this loop or keep it trustworthy, it is
out of scope for the current phase.

## Delivery phases (source of truth: brief §113–116, mirrored here)

- **MVP** — Auth, Organizations/Workspaces/Projects, RBAC, Monitoring +
  Query Builder, Source abstraction (mock + RSS/web connectors), Ingestion
  pipeline, Mentions + search + dedupe, Alerts + notifications, Dashboard,
  Analytics (basic), Daily digest, Basic reports, AI summary/insights,
  Admin, Audit logs.
- **Phase 2** — Competitors, advanced analytics, report builder, team
  collaboration, story clustering, topic intelligence, crisis detection,
  Slack/Teams/webhooks, advanced AI assistant, engagement analytics depth.
- **Phase 3** — TV/Radio/Podcast/YouTube/Social APIs, public comments, AI
  Visibility module, journalist intelligence, campaign measurement,
  predictive trends, enterprise SSO, billing, public API v1.
- **Phase 4** — Mobile/PWA, CRM depth, media outreach, press distribution,
  PR campaign planning, communication calendar, AI agent workflows, MCP
  integration.

Architecture in every phase must not block later phases (see
`ARCHITECTURE.md`), but later-phase code is not written early.

## Non-goals (explicit, to prevent scope creep)

- Not a general-purpose CRM or press-distribution tool (that's Phase 4+).
- Not a generic BI tool — analytics are opinionated toward communications
  use cases.
- Not a public content archive — copyrighted source content is not stored
  or redistributed beyond what each source's policy allows (see
  `SECURITY.md` §Content Rights).
- No feature ships as a UI placeholder ("coming soon" screens that look
  functional). Unbuilt features live on the roadmap doc, not in the app
  chrome.
