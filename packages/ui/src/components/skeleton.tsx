import * as React from "react";
import { cn } from "../lib/cn";

/** Every loading state uses this — never a blank white screen (brief §88). */
export function Skeleton({
  className,
  label = "Loading",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("animate-pulse rounded bg-surface-muted", className)}
      {...props}
    />
  );
}
