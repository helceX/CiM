# Design System

## Character

Minimal, quiet, premium, professional, functional, enterprise, data-first.
Reference character (not visual copying): Linear, Notion, Vercel, Stripe,
Figma, Raycast — studied for spacing, hierarchy, command palette, sidebar,
table, and interaction quality.

**Never**: emoji or emoji-style icons, cartoon icons, gratuitous gradients,
glassmorphism, heavy shadows, oversized border-radius, "AI aesthetic"
(purple glow, sparkles, chat bubbles, robot icons, holographic UI), more
than a restrained accent-color palette, wrapping every region in a card,
neon, decorative illustration.

## Design tokens

CSS custom properties, consumed by Tailwind v4's CSS-first theme
(`@theme` block) — no component ever hardcodes a raw color/spacing value.

```css
--background        --surface           --surface-muted
--foreground         --border            --border-strong
--primary             --primary-foreground
--secondary
--success  --warning  --danger  --info   (+ *-foreground variants)
--radius-sm (6px) --radius (8px) --radius-lg (10px)
--space-1 (4px) --space-2 (8px) --space-3 (12px) --space-4 (16px)
--space-5 (20px) --space-6 (24px) --space-8 (32px) --space-10 (40px)
--space-12 (48px)
```

Brand primary color is a token, swappable per theme, not baked into
component code. Dark mode redefines the same token set under
`prefers-color-scheme`/`data-theme` — components never branch on theme
directly.

## Typography

One font family (Inter or equivalent modern UI sans-serif), loaded once.
Strong, consistent heading scale (page title → section title → card
title → body → caption). Typography exists to carry data legibly, not to
demonstrate design — no decorative type treatments.

## Spacing & radius

8-point spacing scale (4/8/12/16/20/24/32/40/48). Border radius kept in the
6–10px band across the system (`--radius-sm/--radius/--radius-lg`) —
never large "pill-everything" rounding, to preserve enterprise density.

## Icons

Single consistent SVG icon set for all functional UI icons (one library,
not mixed per screen). No emoji, ever. Icon-only buttons require an
accessible label and a tooltip — no exceptions.

## Component library

Built on shadcn/ui's copy-in model on top of **Radix UI** primitives.
shadcn/ui's own default moved to Base UI in mid-2026, but as of this build
`@base-ui/react` is still pre-1.0 (release-candidate) with an API still
settling; Radix is the mature, stable primitive with a well-documented,
verified API and remains fully supported by shadcn/ui (`shadcn migrate
base-ui` can move components later once Base UI reaches a stable 1.0 and
its API is verified against current docs at that time — not guessed).
This is a deliberate stability-over-novelty choice, not an oversight.
Components are copied into `packages/ui` and customized to the token
system, not left as unmodified upstream defaults, and not endlessly
forked into one-off variants per screen.

Core set (brief §58): Button, Input, Select, Combobox, DatePicker,
Popover, Dropdown, Dialog, Drawer, Sheet, Table, DataTable, Badge, Tabs,
Tooltip, Toast, CommandPalette, Chart, Metric, EmptyState, Skeleton,
Pagination, FilterBar, QueryBuilder, AlertCard, MentionRow, InsightPanel.

## Interaction rules

- Hover: subtle only. Transition: fast and quiet (≤150ms, no bouncy
  easing). Animation: minimum necessary, never decorative.
- Loading: skeleton, never a blank white screen; stream/partial-render
  where the framework supports it.
- Toast: short, dismissible, non-blocking.
- Modal (Dialog): only for genuinely blocking decisions; everything else
  that's "more detail on this row" is a Drawer/Sheet, not a modal.
- Real-time updates never silently reflow content under a reading user —
  new data surfaces as "12 new mentions" (a control the user triggers),
  scroll position is preserved.

## Tables (brief §51, the product's primary tool)

Sorting, filtering, column visibility, column reordering, density control,
pagination (+ infinite scroll only where justified), bulk selection + bulk
actions, sticky header, saved views, export. List/table view is the
default for Mentions — card grids are not the primary view.

## AI surfaces

No full-screen chatbot. AI output renders in a small contextual panel or
an "AI Insight" region within existing layout (drawer, dashboard card),
following one shape everywhere: Answer/Summary → Evidence → Sources →
Confidence → Actions. AI is a quiet, evidence-linked layer, never a
separate "AI product" bolted onto the shell.

## Accessibility

WCAG 2.2 AA target. Keyboard navigation and visible focus state on every
interactive element; semantic landmarks/headings for screen readers;
explicit form labels; ARIA used where semantics need it (custom
Combobox/CommandPalette/Drawer); color is never the sole carrier of
meaning (status uses icon/text + color); status changes are announced to
assistive tech (`aria-live` where appropriate).

## Responsive

Desktop-first (the product is data-dense), verified functional at 1440 /
1280 / 1024 / 768 / mobile. Mobile does not shrink the desktop table —
it uses bottom sheets, drawers, horizontal scroll on tables, and a
reduced/priority column set.

## Empty & error states

Every empty state teaches, it doesn't just say "nothing here": states the
situation, explains why, and gives the one next action ("No monitoring
has been created yet." / "Create your first monitoring query" / "Try
tracking your brand, campaign or competitor."). Errors show a user-safe
message plus a reference id — never a raw stack trace, never a dead end
with no action.
