"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Input, Select } from "@cim/ui";

export type FilterBarSelectDef = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
};

/**
 * One filter pattern reused across screens (docs/ux/DESIGN_SYSTEM.md —
 * "Global FilterBar component"): state lives in the URL's search params,
 * so filtered views are shareable/bookmarkable and the server component
 * that renders results reads the same params directly — no client-side
 * duplicate state to keep in sync.
 */
export function FilterBar({
  searchPlaceholder = "Search…",
  selects,
  extraKeys = [],
}: {
  searchPlaceholder?: string;
  selects: FilterBarSelectDef[];
  /** Other URL params that count as an active filter (e.g. a deep-linked ?query=). */
  extraKeys?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(searchParams.get("q") ?? "");

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const activeKeys = ["q", ...selects.map((select) => select.key), ...extraKeys].filter((key) =>
    searchParams.get(key),
  );

  function clearAll() {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of ["q", ...selects.map((select) => select.key), ...extraKeys, "page"]) {
      next.delete(key);
    }
    setSearchDraft("");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    updateParam("q", searchDraft);
  }

  return (
    <div className="flex flex-wrap items-center gap-3" role="search" aria-label="Filters">
      <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[200px]">
        <Input
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label="Search"
        />
      </form>
      {selects.map((select) => (
        <Select
          key={select.key}
          aria-label={select.label}
          value={searchParams.get(select.key) ?? ""}
          onChange={(e) => updateParam(select.key, e.target.value)}
        >
          <option value="">{select.label}: All</option>
          {select.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ))}
      {activeKeys.length > 0 ? (
        <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
          Clear filters ({activeKeys.length})
        </Button>
      ) : null}
    </div>
  );
}
