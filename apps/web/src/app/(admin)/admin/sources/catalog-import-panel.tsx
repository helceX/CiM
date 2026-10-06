"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cim/ui";

/**
 * The worker adds catalog feeds in the background; this shows what it has done and
 * lets an operator pause or resume it. The note says why it last stood down.
 */
export function CatalogImportPanel({
  enabled,
  lastRunAt,
  lastNote,
  added,
  failed,
  skipped,
  catalogTotal,
  sourceCount,
}: {
  enabled: boolean;
  lastRunAt: string | null;
  lastNote: string | null;
  added: number;
  failed: number;
  skipped: number;
  catalogTotal: number;
  sourceCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/catalog/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!response.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setError("Could not change it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Automatic catalog import: {enabled ? "on" : "paused"}
          </p>
          <p className="text-xs text-muted-foreground">
            The worker adds the Türkiye and world catalog feeds by itself — 50 every 5 minutes, each fetch-tested first —
            and stands down while the crawler is not keeping up or the database is filling its volume.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={toggle} disabled={busy}>
          {busy ? "Saving…" : enabled ? "Pause import" : "Resume import"}
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-5">
        <div>
          <dt className="text-xs text-muted-foreground">Catalog feeds</dt>
          <dd className="tabular-nums text-foreground">{catalogTotal.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Sources in total</dt>
          <dd className="tabular-nums text-foreground">{sourceCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Added by the import</dt>
          <dd className="tabular-nums text-foreground">{added.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Unreadable (retried once)</dt>
          <dd className="tabular-nums text-foreground">{failed.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Skipped (blocked / licence)</dt>
          <dd className="tabular-nums text-foreground">{skipped.toLocaleString()}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground" role="status">
        {lastRunAt ? `Last run ${new Date(lastRunAt).toLocaleString()}` : "Has not run yet"}
        {lastNote ? ` — ${lastNote}` : ""}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
