"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Select } from "@cim/ui";

const FREQUENCY_OPTIONS = [
  { value: "none", label: "On demand only" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

function labelFor(frequency: string): string {
  return FREQUENCY_OPTIONS.find((f) => f.value === frequency)?.label ?? frequency;
}

/**
 * docs/product/FEATURE_MATRIX.md P2 "Weekly/monthly/yearly scheduled
 * reports" — display + configure only; the scheduler tick
 * (apps/worker/src/jobs/generate-scheduled-reports.ts) is what actually
 * runs it, once daily, next time this report's frequency says it's due.
 */
export function ScheduleSection({
  reportId,
  scheduleFrequency,
  canManageSchedule,
}: {
  reportId: string;
  scheduleFrequency: string;
  canManageSchedule: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">Schedule</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Automatically generate this report on a recurring basis, in addition to
        on-demand runs.
      </p>
      <div className="mt-3">
        {canManageSchedule ? (
          <FrequencySelect reportId={reportId} scheduleFrequency={scheduleFrequency} />
        ) : (
          <p className="text-sm text-foreground">{labelFor(scheduleFrequency)}</p>
        )}
      </div>
    </section>
  );
}

function FrequencySelect({
  reportId,
  scheduleFrequency,
}: {
  reportId: string;
  scheduleFrequency: string;
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(nextValue: string) {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleFrequency: nextValue }),
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
      id="schedule-frequency"
      label="Frequency"
      className="max-w-xs"
      error={error ?? undefined}
    >
      <Select
        value={scheduleFrequency}
        disabled={isSaving}
        onChange={(e) => handleChange(e.target.value)}
      >
        {FREQUENCY_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
