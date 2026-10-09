"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select } from "@cim/ui";

const RANGES = [
  { value: "7", key: "last7" },
  { value: "30", key: "last30" },
  { value: "90", key: "last90" },
] as const;

/** Shared `?since=` range picker — first used by Analytics, reused by the Social Listening dashboard. */
export function RangeSelect({ current }: { current: number }) {
  const t = useTranslations("ui");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      aria-label={t("dateRange")}
      value={String(current)}
      onChange={(e) => {
        const next = new URLSearchParams(searchParams.toString());
        next.set("since", e.target.value);
        router.push(`${pathname}?${next.toString()}`);
      }}
    >
      {RANGES.map((range) => (
        <option key={range.value} value={range.value}>
          {t(range.key)}
        </option>
      ))}
    </Select>
  );
}
