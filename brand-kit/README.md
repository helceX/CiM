# Mediaory brand kit

Everything the product uses to look like Mediaory lives here. The app, reports,
archives and exports read from these files — change a file here and re-run
`pnpm exec tsx scripts/build-brand-assets.ts` to refresh the copies the code uses.

## Logo (`logo/`)

| File | Use |
| --- | --- |
| `mediaory-logo.png` | Full logo for **light** backgrounds (dark wordmark), transparent. |
| `mediaory-logo-light.png` | Full logo for **dark** backgrounds (white wordmark), transparent. |
| `mediaory-mark.png` | The circle mark alone — favicons, avatars, small spaces. |
| `mediaory-logo-original.webp` | The supplied artwork, untouched. |

Keep clear space around the logo equal to the height of the "m". Do not recolour,
stretch or add effects. Minimum width: 96 px for the full logo, 24 px for the mark.

## Colour (`colors.json`)

| Role | Hex |
| --- | --- |
| Cyan (top of the mark) | `#00C7FA` |
| Sky | `#0096F8` |
| Blue | `#0026EA` |
| Deep blue | `#0003AA` |
| Violet | `#6F26F7` |
| Ink (text on light) | `#05051A` |

The brand gradient runs violet → blue → cyan (`#6F26F7 → #0026EA → #00C7FA`).

## Adding files on GitHub

* **Upload:** repository → *Add file* → *Upload files*, drag files in, commit.
* **Create a folder:** *Add file* → *Create new file*, and type the folder name
  **followed by a slash** and a file name, e.g. `brand-kit/fonts/README.md`.
  Without the slash GitHub creates a file, not a folder.
