"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cim/ui";

export function MarkReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function markRead() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/social/events/read", { method: "POST" });
      if (!response.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={markRead} disabled={busy}>
        Mark all as read
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          Could not update.
        </span>
      ) : null}
    </div>
  );
}
