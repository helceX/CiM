# Information Architecture

## Public vs. authenticated

**Public** (`/`, `/features`, `/solutions`, `/security`, `/resources`,
`/pricing`, `/contact`, `/login`, `/register`, `/verify-email`,
`/forgot-password`, `/reset-password`) is a distinct route group from the
**authenticated app** (`/app/*` or an equivalent segmented route group) —
different layout, different navigation, no shared chrome beyond design
tokens.

## Primary navigation (authenticated app)

Minimal left sidebar, no deep nested menus by default:

```
Dashboard
Monitoring
Mentions
Alerts
Insights
Analytics
Reports
Sources
Projects
AI Intelligence      (Phase 2+, hidden until it has content)
Settings
```

Nested navigation is used only where a section genuinely has sub-areas
(e.g. Settings → Organization/Members/Billing-readiness/API Keys), never
as a default pattern.

## Global command palette (Cmd/Ctrl+K)

Not a page-search box — a unified entry point over:
- Navigation (pages)
- Objects (projects, saved searches, mentions, sources, reports, people,
  companies, keywords)
- Actions ("Create monitoring", "Create alert", "Generate report", "Show
  yesterday's mentions", "Open latest crisis alerts")

Implemented as one `CommandPalette` component with pluggable result
providers per object/action type, so Phase 2/3 object types register
providers rather than the palette being rewritten.

## Progressive disclosure (brief §2)

Simple UI is the default surface; advanced capability is reachable, not
hidden permanently:
- Query Builder: Simple (chip) mode is default; Advanced (Boolean syntax)
  mode is one toggle away, same underlying `QueryAST` (see `SEARCH.md`).
- Filters: a compact `FilterBar` covers common filters; "Advanced filters"
  opens the full set in a panel, not inline sprawl.
- Report Builder: templates first; full section-by-section customization
  is opt-in.
- Alert rules: sensible defaults on creation; threshold/cooldown/grouping
  tuning is in an "Advanced" section of the same form, not a separate
  screen.

## Role-based information hierarchy (brief §47)

Same underlying dataset, different emphasis:

| Role | Dashboard leads with |
|---|---|
| Communications Manager | Crisis/risk signals, media volume, reputation, competitor movement |
| Executive (CEO/CMO) | Executive summary, critical alerts, share of voice, major changes |
| Analyst | Raw mentions, sources, queries, topics, advanced filters |

This is implemented as configurable dashboard section ordering/visibility
per role default (user can still customize), not as separate dashboard
codebases per role.

## Projects as the working context

An Organization has one or more Projects (e.g. "BTM Corporate", "BTM
TEKMER", "Competitor Monitoring"). Most authenticated screens
(Monitoring, Mentions, Alerts, Reports, Dashboard) are implicitly scoped
to a selected Project via a persistent project switcher in the top bar,
not a parameter the user re-selects per screen.

## Screen-to-entity map (see `SCREEN_INVENTORY.md` for full detail)

Dashboard → aggregates across active Project(s). Monitoring → list/detail
of `MonitoringQuery`. Mentions → list/detail (drawer) of `Mention`. Alerts
→ list/detail of `AlertRule` + `AlertEvent` history. Analytics → derived
views over `MetricSnapshot`/aggregates. Reports → `Report`/`ReportRun`.
Sources → `Source` + health. Settings → `Organization`,
`OrganizationMembership`, `ApiKey`, `Integration`.
