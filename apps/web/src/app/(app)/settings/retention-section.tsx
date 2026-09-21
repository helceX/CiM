"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Select } from "@cim/ui";

const PRESETS = [
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "730", label: "2 years" },
  { value: "1825", label: "5 years" },
  { value: "forever", label: "Keep forever" },
] as const;

function labelFor(mentionRetentionDays: number | null): string {
  if (mentionRetentionDays === null) return "Keep forever";
  const known = PRESETS.find((p) => p.value === String(mentionRetentionDays));
  return known ? known.label : `${mentionRetentionDays} days`;
}

/**
 * docs/ux/SCREEN_INVENTORY.md Screen 17 — "data retention policy
 * (display + configure, enforcement per roadmap)". Configuring this only
 * changes what's displayed here; nothing purges data yet — the cleanup
 * worker that would enforce it is explicitly P2
 * (docs/product/FEATURE_MATRIX.md), not silently implied by this UI.
 */
export function RetentionSection({
  mentionRetentionDays,
  canManageSettings,
}: {
  mentionRetentionDays: number | null;
  canManageSettings: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">Data retention</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        How long mentions are kept before they&apos;re eligible for automatic cleanup.
        Cleanup itself isn&apos;t built yet — this only sets the policy.
      </p>
      <div className="mt-3">
        {canManageSettings ? (
          <RetentionSelect mentionRetentionDays={mentionRetentionDays} />
        ) : (
          <p className="text-sm text-foreground">{labelFor(mentionRetentionDays)}</p>
        )}
      </div>
    </section>
  );
}

function RetentionSelect({
  mentionRetentionDays,
}: {
  mentionRetentionDays: number | null;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentValue =
    mentionRetentionDays === null ? "forever" : String(mentionRetentionDays);

  async function handleChange(nextValue: string) {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/organizations/retention-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentionRetentionDays: nextValue === "forever" ? null : Number(nextValue),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Field
      id="retention-days"
      label="Mention retention"
      className="max-w-xs"
      error={error ?? undefined}
    >
      <Select
        value={currentValue}
        disabled={isSaving}
        onChange={(e) => handleChange(e.target.value)}
      >
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
