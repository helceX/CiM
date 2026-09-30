# User Flows

## 1. Registration → first value (target: under 3 minutes)

```
Public /register
  → submit (first name, last name, work email, company, role, password)
  → create User (unverified) + Organization + Workspace + Membership(role=owner)
  → send verification email (signed, expiring token)
  → show "check your email" state (no session yet)
User clicks verification link
  → /verify-email?token=...
  → mark user verified, create session
  → redirect to onboarding
Onboarding (5 steps, skippable after step 2 with sane defaults)
  1. What do you want to track? (company/brand/product/competitor/campaign/topic/person/industry)
  2. Add keywords (chips, min 1)
  3. Choose sources (news/web/social/video/podcast/forums/comments/all available)
  4. Notification preference (instant/high-priority/daily digest/weekly)
  5. Finish → creates first Project + MonitoringQuery, redirect to Dashboard
Dashboard
  → mock/seeded or first live connector results appear within the session
    (never a blank screen — see EmptyState rules in DESIGN_SYSTEM.md)
```

Constraints:
- Never email a plaintext or system-generated password. Users always set
  their own password (see ADR-005).
- Organization/workspace/project creation on registration is transactional:
  if any step fails, nothing is half-created.

## 2. Daily core loop (the "10 steps" from brief §150)

1. Open dashboard → "Since yesterday" executive brief.
2. See important/critical alerts (Notification Center + dashboard banner).
3. Read AI "what changed" summary, with evidence link.
4. Scan Top Stories.
5. Open a story → Mention Detail Drawer.
6. See related coverage (story cluster) if available.
7. Review engagement/reach (or "Not available").
8. Read AI insight for that story (with confidence + sources).
9. Assign mention to a teammate if action needed (P2 collaboration).
10. Daily report/digest already generated and available/sent.

## 3. Create a monitoring query

```
Monitoring → "New monitoring"
  → Name, Keywords (chips), Exact phrase, Exclude terms, Source types
  → Simple mode (chip builder) ⇄ Advanced mode (Boolean syntax), same
    underlying QueryAST — switching modes never silently changes meaning
  → "Preview results" → shows count + sample matches over last 30 days,
    flags queries that are too broad/narrow (e.g. single ambiguous term)
  → Save → MonitoringQuery created, ingestion picks it up on next cycle
```

## 4. Alert configuration → delivery

```
Alerts → "New alert rule"
  → Type (keyword / high-relevance / spike / sentiment shift / competitor /
    engagement spike / emerging topic / crisis)
  → Scope (project/query), threshold/sensitivity, channels (in-app/email;
    Slack/Teams/webhook are P2), delivery (immediate/hourly/daily), quiet
    hours (with "critical can bypass" toggle)
  → Save → AlertRule active
Ingestion/analytics pipeline evaluates rules per cycle
  → AlertEvent created → deduplicated/grouped by story cluster →
    Notification created → delivered per user channel preference
```

## 5. Report generation

```
Reports → New report (from template or blank)
  → Section builder: Overview/KPI/Trend/Top Stories/Sources/Sentiment/
    Topics/Competitors/AI Insight/Recommendations (reorderable)
  → Period: current vs previous (calendar or rolling — UI states which)
  → Save / Duplicate / Schedule / Export (PDF/CSV/XLSX) / Share
ReportRun executes async (worker), user is notified when ready
  → Failure surfaces "Report generation failed" with retry + error
    reference, never a silently missing report
```

## 6. Admin: source failure investigation

```
Admin → Sources → filter by status != healthy
  → open Source → see health history, last error, retry/backoff state
  → "why is this source not producing data?" is answerable without
    reading logs
```
