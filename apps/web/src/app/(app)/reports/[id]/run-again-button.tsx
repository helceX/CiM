"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cim/ui";

export function RunAgainButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRun() {
    setIsSubmitting(true);
    try {
      await fetch(`/api/reports/${reportId}/runs`, { method: "POST" });
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="secondary" onClick={handleRun} disabled={isSubmitting}>
      {isSubmitting ? "Starting…" : "Run again"}
    </Button>
  );
}
