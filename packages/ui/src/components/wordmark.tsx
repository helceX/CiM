import { cn } from "../lib/cn";

/**
 * The Mediaory mark: a signal line that traces an "M" — two peaks rising
 * out of the noise. Drawn in currentColor so it follows whatever text
 * color surrounds it (and any gradient a marketing surface paints on it).
 */
export function WordmarkGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.25em"
      height="1.25em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3.5 19V7.5L9 14l3-8.5 3 8.5 5.5-6.5V19" />
    </svg>
  );
}

export function Wordmark({
  className,
  glyph = true,
}: {
  className?: string;
  glyph?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      {glyph ? <WordmarkGlyph /> : null}
      <span>Mediaory</span>
    </span>
  );
}
