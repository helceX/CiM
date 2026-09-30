import * as React from "react";
import { cn } from "../lib/cn";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-9 rounded border border-border bg-surface px-2.5 text-sm text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        invalid && "border-danger focus-visible:ring-danger",
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = "Select";
