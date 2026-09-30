"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cim/ui";

export function RunAgainButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/runs`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="secondary" onClick={handleRun} disabled={isSubmitting}>
        {isSubmitting ? "Starting…" : "Run again"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
