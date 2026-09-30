# Marketing site (mediaory.io)

The public site is deliberately a different surface from the product. The
product UI (`docs/ux/DESIGN_SYSTEM.md`) is calm and data-dense; the marketing
site is the stage. All marketing styling is scoped to `.mk`
(`apps/web/src/app/marketing.css`) and never leaks into `(app)`/`(admin)`.

## Structure
- `src/app/(marketing)` — landing, features, solutions, security, resources,
  pricing, contact. `src/app/(public)` — auth/invitation pages share the same
  canvas (header/footer) via `.mk`.
- `src/components/marketing/*` — header, footer, device frames, scroll story,
  reveal/tilt helpers. Motion is progressive: content renders visible on the
  server and `prefers-reduced-motion` disables all of it.
- Palette: ink canvas, violet → magenta → coral gradient, cyan counter-accent.
  Text/gradient pairs were chosen for WCAG AA on the ink background; buttons
  use a darker gradient so white text stays AA.

## Honesty rules
- Only advertise what exists. Unbuilt items (brand groups, chart/table
  builder, credit pricing, public API docs) are labelled **Coming soon**.
- Laptop screens are real captures of the app. The phone screen is an
  illustration and the page says so.

## Languages
All copy is in `apps/web/messages/<locale>.json` (no strings in components).
To add a language:
1. Add the code to `LOCALES` and a label to `LOCALE_LABELS` in
   `src/i18n/config.ts`.
2. Add `messages/<code>.json` with exactly the same keys as `en.json`
   (`src/i18n/config.test.ts` enforces key parity and one catalog per locale).
The switcher appears automatically once there are two or more locales.
English is the default; an explicit choice (cookie) beats `Accept-Language`.
The product UI is still English-only and is marked `lang="en"`.

## Refreshing the screenshots
`apps/web/public/mockups/*.webp` are captures of the seeded demo org
(`pnpm db:seed`) at a 1000×625 viewport, 2.5× DPR, resized to 1800px wide,
taken from a production build (the dev server draws a badge on screen).
Re-take them whenever the app's look changes noticeably.
