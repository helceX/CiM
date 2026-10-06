"use client";

import { useState } from "react";
import { Button } from "@cim/ui";

/** Platform admins only: queue the last completed week's archive without waiting for the daily schedule. */
export function ArchiveRunNow() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/archive/run", { method: "POST" });
      if (!response.ok) throw new Error("failed");
      setMessage("Queued. Reload in a minute or two.");
    } catch {
      setMessage("Could not queue the archive. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button size="sm" variant="secondary" onClick={run} disabled={busy}>
        {busy ? "Queuing…" : "Build last week now"}
      </Button>
      {message ? (
        <span role="status" className="text-xs text-muted-foreground">
          {message}
        </span>
      ) : null}
    </div>
  );
}
