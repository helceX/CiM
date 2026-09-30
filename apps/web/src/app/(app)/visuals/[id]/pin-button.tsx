"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cim/ui";

export function PinButton({ id, pinned }: { id: string; pinned: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function toggle() {
    setError(null);
    setIsBusy(true);
    try {
      const response = await fetch(`/api/visuals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !pinned }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="secondary" size="sm" onClick={toggle} disabled={isBusy} aria-pressed={pinned}>
        {pinned ? "Unpin from Dashboard" : "Pin to Dashboard"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
