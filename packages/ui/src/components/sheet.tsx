import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

/**
 * Right-anchored panel for "more detail on this row without leaving the
 * table" (docs/ux/DESIGN_SYSTEM.md — Drawer/Sheet is a distinct pattern
 * from the centered, blocking Dialog). Built on the same Radix Dialog
 * primitive as Dialog, just positioned and animated differently.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string }
>(({ className, children, title, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/20" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-y-auto",
        "border-l border-border bg-surface p-6 shadow-lg",
        "focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <DialogPrimitive.Title className="text-base font-semibold text-foreground">
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Close
          aria-label="Close"
          className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";
