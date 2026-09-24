"use client";

import { useState } from "react";
import { Button } from "@cim/ui";

export type ActiveShareLinkInfo = { expiresAt: string } | null;

/**
 * docs/product/FEATURE_MATRIX.md P2 "sharing links". The raw share URL
 * only ever exists in this component's state right after creation —
 * packages/db only ever stores its hash (schema/reports.ts's
 * reportShareLinks comment), so a page reload genuinely cannot recover
 * it. That's why `newUrl` and the persisted `activeLink` (expiry only,
 * survives reload) are tracked separately rather than as one value.
 */
export function ShareLinkControl({
  reportId,
  runId,
  initialActiveLink,
}: {
  reportId: string;
  runId: string;
  initialActiveLink: ActiveShareLinkInfo;
}) {
  const [activeLink, setActiveLink] = useState(initialActiveLink);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setIsLoading(true);
    setCopied(false);
    try {
      const response = await fetch(`/api/reports/${reportId}/runs/${runId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setNewUrl(data.url);
      setActiveLink({ expiresAt: data.expiresAt });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRevoke() {
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/runs/${runId}/share`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setActiveLink(null);
      setNewUrl(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy() {
    if (!newUrl) return;
    try {
      await navigator.clipboard.writeText(newUrl);
      setCopied(true);
    } catch {
      setError("Couldn't copy automatically — select and copy the link manually.");
    }
  }

  if (newUrl) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <p className="text-muted-foreground">
          Copy this now — it won&apos;t be shown again. Expires{" "}
          {new Date(activeLink!.expiresAt).toLocaleDateString()}.
        </p>
        <div className="flex items-center gap-2">
          <code className="max-w-[200px] truncate rounded-sm bg-surface-muted px-1.5 py-0.5">
            {newUrl}
          </code>
          <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleRevoke}
            disabled={isLoading}
          >
            Revoke
          </Button>
        </div>
        {error ? <p className="text-danger">{error}</p> : null}
      </div>
    );
  }

  if (activeLink) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <p className="text-muted-foreground">
          Link active, expires {new Date(activeLink.expiresAt).toLocaleDateString()}.
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleRevoke}
          disabled={isLoading}
        >
          Revoke
        </Button>
        {error ? <p className="text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={handleCreate}
        disabled={isLoading}
      >
        {isLoading ? "Creating…" : "Share"}
      </Button>
      {error ? <p className="text-danger">{error}</p> : null}
    </div>
  );
}
