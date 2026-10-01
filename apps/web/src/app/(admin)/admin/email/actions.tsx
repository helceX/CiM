"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cim/ui";

export function TestEmailButton({ to }: { to: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "queued" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    try {
      const response = await fetch("/api/admin/email/test", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Could not queue the test email.");
        setState("error");
        return;
      }
      setState("queued");
      // Give the worker a moment, then show the outcome in the list.
      setTimeout(() => router.refresh(), 4000);
    } catch {
      setError("Could not queue the test email.");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" size="sm" onClick={send} disabled={state === "sending"}>
        {state === "sending" ? "Queuing…" : `Send a test email to ${to}`}
      </Button>
      {state === "queued" ? (
        <p role="status" className="text-xs text-muted-foreground">
          Queued. The list below refreshes in a few seconds; use “Refresh” if it still says pending.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      <Button type="button" size="sm" variant="ghost" onClick={() => router.refresh()}>
        Refresh
      </Button>
    </div>
  );
}

export function VerifyUserButton({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${id}/verify`, { method: "POST" });
      if (!response.ok) {
        setError("Could not verify.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not verify.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={verify} disabled={busy} aria-label={`Mark ${email} as verified`}>
        {busy ? "Verifying…" : "Mark verified"}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
