"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@cim/ui";

export type ConnectedAccount = {
  id: string;
  platform: string;
  platformLabel: string;
  handle: string;
  displayName: string | null;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type ConnectablePlatform = { key: string; label: string; reads: string; connected: boolean };
export type PlannedPlatform = { key: string; label: string; note: string };

const NOTICES: Record<string, { tone: "ok" | "error"; text: string }> = {
  connected: { tone: "ok", text: "Account connected. New mentions and comments will show up here and in your notifications." },
  denied: { tone: "error", text: "The platform did not grant access, so nothing was connected." },
  expired: { tone: "error", text: "That sign-in took too long or was started elsewhere. Please try connecting again." },
  failed: { tone: "error", text: "Could not finish connecting the account. Please try again." },
  unavailable: { tone: "error", text: "That platform is not set up on this Mediaory yet." },
  forbidden: { tone: "error", text: "Only an owner or admin can connect accounts." },
  "slow-down": { tone: "error", text: "Too many attempts. Please wait a bit and try again." },
};

/**
 * Link your own social accounts. Mediaory reads only what that account is
 * allowed to see — comments on its videos, posts that mention it — through the
 * platform's official API, and nothing is posted on your behalf. Disconnecting
 * deletes the stored access and everything collected from the account.
 */
export function ConnectedAccountsSection({
  accounts,
  platforms,
  planned,
  canManage,
  notice,
}: {
  accounts: ConnectedAccount[];
  platforms: ConnectablePlatform[];
  planned: PlannedPlatform[];
  canManage: boolean;
  notice: string | null;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const flash = notice ? NOTICES[notice] : undefined;

  async function disconnect(account: ConnectedAccount) {
    if (!window.confirm(`Disconnect ${account.handle}? Its stored access and the mentions collected from it are deleted.`)) return;
    setBusyId(account.id);
    setError(null);
    try {
      const response = await fetch(`/api/social/connections/${account.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not disconnect.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not disconnect.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section id="connected-accounts" aria-labelledby="connected-accounts-heading">
      <h2 id="connected-accounts-heading" className="text-sm font-semibold text-foreground">
        Connected accounts
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Link your own social accounts to be told when someone comments on your videos or mentions you — with a link
        straight to the post. Mediaory only reads, through each platform&apos;s official API, and never posts for you.
        See all of it under{" "}
        <Link href="/social/mentions" className="text-primary underline underline-offset-2">
          Mentions &amp; tags
        </Link>
        .
      </p>

      {flash ? (
        <p role={flash.tone === "error" ? "alert" : "status"} className={`mt-2 text-sm ${flash.tone === "error" ? "text-danger" : "text-success"}`}>
          {flash.text}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {accounts.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {accounts.map((account) => (
            <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {account.platformLabel} · {account.handle}
                </p>
                <p className="text-xs text-muted-foreground">
                  {account.status === "needs_reauth"
                    ? "Access was withdrawn — reconnect to keep receiving mentions."
                    : account.status === "error"
                      ? `Last check failed${account.lastError ? `: ${account.lastError}` : "."}`
                      : account.lastSyncAt
                        ? `Last checked ${new Date(account.lastSyncAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
                        : "Waiting for the first check…"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {account.status === "active" ? <Badge tone="success">Connected</Badge> : <Badge tone="danger">Needs attention</Badge>}
                {canManage ? (
                  <>
                    {account.status !== "active" ? (
                      <Button asChild size="sm" variant="secondary">
                        <a href={`/api/social/connect/${account.platform}`}>Reconnect</a>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === account.id}
                      onClick={() => disconnect(account)}
                      aria-label={`Disconnect ${account.platformLabel} ${account.handle}`}
                    >
                      Disconnect
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {platforms.map((platform) => (
          <div key={platform.key} className="rounded-lg border border-border px-3 py-2">
            <p className="text-sm font-medium text-foreground">{platform.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{platform.reads}</p>
            {canManage ? (
              <Button asChild size="sm" variant="secondary" className="mt-2">
                <a href={`/api/social/connect/${platform.key}`}>{platform.connected ? `Connect another ${platform.label} account` : `Connect ${platform.label}`}</a>
              </Button>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Ask an owner or admin to connect it.</p>
            )}
          </div>
        ))}
        {platforms.length === 0 ? (
          <p className="text-sm text-muted-foreground sm:col-span-2">
            No platform is switched on for connecting accounts on this Mediaory yet.
          </p>
        ) : null}
      </div>

      {planned.length > 0 ? (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer text-foreground">Coming next</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {planned.map((platform) => (
              <li key={platform.key}>
                <span className="font-medium text-foreground">{platform.label}</span> — {platform.note}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
