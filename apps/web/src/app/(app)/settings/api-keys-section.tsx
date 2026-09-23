"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Checkbox, Field, Input } from "@cim/ui";
import type { Permission } from "@cim/core";

export type ApiKeySummary = {
  id: string;
  name: string;
  scopes: string[];
  createdByUserId: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const SCOPE_OPTIONS: { value: Permission; label: string }[] = [
  { value: "mentions:read", label: "Read mentions" },
  { value: "reports:read", label: "Read reports" },
  { value: "monitoring:read", label: "Read monitoring queries" },
  { value: "alerts:write", label: "Manage alert rules" },
  { value: "monitoring:write", label: "Manage monitoring queries" },
];

/**
 * docs/architecture/SECURITY.md §83 / FEATURE_MATRIX.md "API keys +
 * public API" (MVP: "Internal only"). The raw secret is shown exactly
 * once, right after creation — this component's own local state, never
 * persisted or refetchable, the same one-time-reveal discipline the
 * invitation/verification email links already follow server-side.
 */
export function ApiKeysSection({
  apiKeys,
  apiKeyCount,
  canManageApiKeys,
}: {
  // Only ever populated when canManageApiKeys is true — a "use client"
  // component's props are serialized into the page's RSC payload
  // regardless of what it renders, so the full key list (names, scopes,
  // who created each one) must never reach the browser for a member who
  // can't manage keys. apiKeyCount alone covers what the read-only view
  // below actually shows.
  apiKeys: ApiKeySummary[];
  apiKeyCount: number;
  canManageApiKeys: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Permission[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  function toggleScope(scope: Permission) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  async function handleCreate() {
    setError(null);
    setIsCreating(true);
    try {
      const response = await fetch("/api/organizations/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setRevealedKey(data.rawKey);
      setName("");
      setScopes([]);
      router.refresh();
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setError(null);
    const response = await fetch(`/api/organizations/api-keys/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Please try again.");
      return;
    }
    router.refresh();
  }

  if (!canManageApiKeys) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-foreground">API keys</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {apiKeyCount} key{apiKeyCount === 1 ? "" : "s"} configured.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">API keys</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Internal-use keys scoped to specific read/write permissions — the same
        authorization every session-based request goes through.
      </p>

      {revealedKey ? (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-medium text-foreground">
            Copy this key now — it won&apos;t be shown again.
          </p>
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-xs">
            {revealedKey}
          </code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => setRevealedKey(null)}
          >
            Done
          </Button>
        </div>
      ) : null}

      {apiKeys.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {apiKeys.map((key) => (
            <li
              key={key.id}
              className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{key.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {key.scopes.map((scope) => (
                    <Badge key={scope} tone="neutral">
                      {scope}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {key.revokedAt
                    ? "Revoked"
                    : key.lastUsedAt
                      ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                      : "Never used"}
                </p>
              </div>
              {!key.revokedAt ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleRevoke(key.id)}
                >
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <Field id="api-key-name" label="Key name" className="max-w-xs" error={error ?? undefined}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Internal reporting script" />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Scopes</span>
          {SCOPE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={scopes.includes(option.value)}
                onCheckedChange={() => toggleScope(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <div>
          <Button
            type="button"
            size="sm"
            disabled={isCreating || !name.trim() || scopes.length === 0}
            onClick={handleCreate}
          >
            {isCreating ? "Creating…" : "Create key"}
          </Button>
        </div>
      </div>
    </section>
  );
}
