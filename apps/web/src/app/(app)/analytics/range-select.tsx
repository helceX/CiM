"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@cim/ui";

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

export function RangeSelect({ current }: { current: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      aria-label="Date range"
      value={String(current)}
      onChange={(e) => {
        const next = new URLSearchParams(searchParams.toString());
        next.set("since", e.target.value);
        router.push(`${pathname}?${next.toString()}`);
      }}
    >
      {RANGES.map((range) => (
        <option key={range.value} value={range.value}>
          {range.label}
        </option>
      ))}
    </Select>
  );
}
