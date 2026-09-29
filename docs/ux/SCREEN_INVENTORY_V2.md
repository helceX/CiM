# Screen Inventory — V2 Delta

Companion to `docs/ux/SCREEN_INVENTORY.md`. Lists only screens that are
**new** or **materially changed** for the Social Listening initiative.
Every screen in the existing inventory (landing, login, register, verify,
forgot/reset password, onboarding, dashboard, monitoring, mentions,
alerts, analytics, reports, settings, admin) is retained as-is — see
`CIM_V2_CHANGE_REPORT.md` for why no desktop-parity or public-site
rebuild is needed.

## New screens

| Screen | Route | Phase | Notes |
|---|---|---|---|
| Social Listening Overview | `/social` | 45 | KPIs (conversations, direct mentions, unprompted, unique authors, engagement, velocity, reach, sentiment), platform distribution, trending topics/hashtags, top authors/posts — mirrors Dashboard's information hierarchy (what happened → what changed → why it matters). |
| Social Conversation / Story detail | `/social/stories/[id]` | 48 | Cross-platform propagation view for one `StoryCluster`; AI social summary with evidence. |
| Unprompted Brand Conversations | `/social?filter=unprompted` (filter on the Overview screen, not a separate route) | 46 | Confidence-labeled semantic matches only — never rendered as a confirmed mention. |

## Changed screens

| Screen | Route | Change | Phase |
|---|---|---|---|
| Mention Detail Drawer | `apps/web/src/app/(app)/mentions/mention-detail-drawer.tsx` | Add "Why matched?" section (matched rule, match type, confidence) and, for social-sourced mentions, author card (handle, followers, verified) + engagement/reach block. | 43–44 |
| Mentions list filters | `/mentions` | Add Match Type, Platform, Engagement, Reach filter facets. | 44 |
| Monitoring query builder | `/monitoring/new` | Add Handles/Hashtags/Aliases fields to the existing query form; Advanced (Boolean) mode unchanged. | 43 |
| Alert rule creation | `/alerts/new` | Add social alert types (creator spike, cross-platform spread, emerging narrative, unprompted-conversation spike) to the existing type selector — same pattern as prior alert-type additions (Phase 15, 19, 32). | 46, 48 |

## Explicitly not built (out of scope this pass)

- Any desktop-specific screen or native-shell chrome (no desktop client
  exists; master prompt §5/§63–65/§159 dropped per user confirmation).
- A dedicated "AI chat" screen (master prompt §98 explicitly rules this
  out — AI stays contextual, inside Dashboard/Mention/Social/Report, as
  already implemented in Phase 25/41's AI Assistant panel).
- Global command palette (Cmd/Ctrl+K) — feature-matrixed as Phase 2,
  not part of the Social Listening MVP slice.
