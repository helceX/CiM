"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { NAV_ITEMS } from "./nav-config";

type PaletteAction = { id: string; label: string; run: (router: ReturnType<typeof useRouter>) => void };

const ACTIONS: PaletteAction[] = [
  { id: "goto-dashboard", label: "Go to Dashboard", run: (router) => router.push("/dashboard") },
  { id: "goto-settings", label: "Go to Settings", run: (router) => router.push("/settings") },
];

/**
 * Cmd/Ctrl+K — navigation + actions today; object search (mentions,
 * sources, reports, saved views) registers as those modules ship,
 * per docs/ux/INFORMATION_ARCHITECTURE.md's pluggable-provider design.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const navResults = NAV_ITEMS.filter((item) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    ).map((item) => ({ id: item.href, label: `Go to ${item.label}`, run: () => router.push(item.href) }));
    const actionResults = ACTIONS.filter((action) =>
      action.label.toLowerCase().includes(query.toLowerCase()),
    ).map((action) => ({ id: action.id, label: action.label, run: () => action.run(router) }));
    return [...navResults, ...actionResults];
  }, [query, router]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="flex h-8 items-center gap-2 rounded border border-border bg-surface px-2.5 text-sm text-muted-foreground hover:bg-surface-muted"
        aria-label="Open command palette"
      >
        <Search className="size-3.5" aria-hidden="true" />
        Search
        <kbd className="ml-4 rounded-sm border border-border-strong px-1 text-[10px]">⌘K</kbd>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/20" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-border bg-surface shadow-lg"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages and actions…"
              aria-label="Search pages and actions"
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</li>
            ) : (
              results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => {
                      result.run();
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center rounded-sm px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                  >
                    {result.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
