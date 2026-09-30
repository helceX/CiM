"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Input, Select } from "@cim/ui";

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
}: {
  searchPlaceholder?: string;
  selects: FilterBarSelectDef[];
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

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    updateParam("q", searchDraft);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
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
    </div>
  );
}
