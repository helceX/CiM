"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@cim/ui";

async function call(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return { ok: response.ok, error: data.error };
}

export function ResolveTakedownForm({ id }: { id: string }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: "block_and_purge" | "block" | "resolve" | "reject") {
    if (action === "block_and_purge" && !window.confirm(`Delete everything stored from ${domain}? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { ok, error: message } = await call(`/api/admin/takedowns/${id}`, "POST", {
        action,
        note,
        domain: domain || undefined,
      });
      if (!ok) {
        setError(message ?? "Could not save.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`domain-${id}`}>Domain to block</Label>
          <Input id={`domain-${id}`} placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`note-${id}`}>Note (kept with the request)</Label>
          <Input id={`note-${id}`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || !domain} onClick={() => submit("block_and_purge")}>
          Block and remove stored content
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy || !domain} onClick={() => submit("block")}>
          Block only
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => submit("resolve")}>
          Mark resolved
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => submit("reject")}>
          Dismiss
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function BlockDomainForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [reason, setReason] = useState("");
  const [purge, setPurge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/blocked-domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain, reason, purge }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        block?: { sourcesPaused: number; articlesDeleted: number };
      };
      if (!response.ok) {
        setMessage({ tone: "error", text: data.error ?? "Could not block." });
        return;
      }
      setMessage({
        tone: "ok",
        text: `Blocked. ${data.block?.sourcesPaused ?? 0} source(s) paused, ${data.block?.articlesDeleted ?? 0} article(s) removed.`,
      });
      setDomain("");
      setReason("");
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Could not block." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="block-domain">Domain</Label>
        <Input id="block-domain" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="block-reason">Reason</Label>
        <Input id="block-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} required />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
        <input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} />
        Also delete the articles already stored from this publisher
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Blocking…" : "Block publisher"}
        </Button>
      </div>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`text-sm sm:col-span-2 ${message.tone === "error" ? "text-danger" : "text-success"}`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}

export function UnblockButton({ id, domain }: { id: string; domain: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function unblock() {
    if (!window.confirm(`Unblock ${domain}? Its sources stay paused until you resume them.`)) return;
    setBusy(true);
    try {
      const { ok } = await call(`/api/admin/blocked-domains/${id}`, "DELETE");
      if (ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={unblock} aria-label={`Unblock ${domain}`}>
      Unblock
    </Button>
  );
}
