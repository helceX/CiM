import { cn } from "../lib/cn";

/**
 * The Mediaory mark — the circle with the speech bubble — as the real logo artwork
 * (brand-kit/logo, copied to /brand by scripts/build-brand-assets.ts).
 */
export function WordmarkGlyph({ className }: { className?: string }) {
  return (
    <img src="/brand/mediaory-mark.png" alt="" aria-hidden="true" width={20} height={18} className={cn("inline-block h-[1.15em] w-auto", className)} />
  );
}

/**
 * The Mediaory logo. `surface` says what it sits on: the logo has a dark wordmark for light
 * surfaces and a white one for dark surfaces.
 *  - "dark" / "light": a fixed variant.
 *  - "panel": the signed-in panel, which has its own theme switch (`.mp[data-mp-theme]`) — white
 *    wordmark on the dark canvas, dark wordmark on the light one, whatever the computer's setting is.
 *  - "auto": follows the page-level theme (`data-theme` / the computer's setting).
 */
export function Wordmark({
  className,
  surface = "auto",
}: {
  className?: string;
  /** Kept for existing callers: `glyph={false}` was the text-only variant, which the logo replaces. */
  glyph?: boolean;
  surface?: "auto" | "dark" | "light" | "panel";
}) {
  const imgClass = "h-full w-auto";
  const onDark = surface === "panel" ? "mp-logo-ink" : surface === "auto" ? "mp-logo-on-dark" : undefined;
  const onLight = surface === "panel" ? "mp-logo-paper" : surface === "auto" ? "mp-logo-on-light" : undefined;
  return (
    <span className={cn("mp-logo inline-flex h-8 items-center", className)} role="img" aria-label="Mediaory">
      {surface !== "light" ? (
        <img src="/brand/mediaory-logo-light.png" alt="" aria-hidden="true" width={113} height={32} className={cn(imgClass, onDark)} />
      ) : null}
      {surface !== "dark" ? (
        <img src="/brand/mediaory-logo.png" alt="" aria-hidden="true" width={113} height={32} className={cn(imgClass, onLight)} />
      ) : null}
    </span>
  );
}
