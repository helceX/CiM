"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@cim/ui";

type Preview = { unmatchedStories: number; matchedStories: number; mentions: number };

/**
 * "Free space now": delete stored stories older than N days. By default only stories no
 * customer's monitoring matched (pure cache); the second option also deletes matched ones
 * and so their mentions, and needs the word DELETE typed. Shows the numbers first.
 */
export function StoragePrune() {
  const router = useRouter();
  const [days, setDays] = useState("7");
  const [includeMatched, setIncludeMatched] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 0 && n <= 3650;

  async function check() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/storage/prune?days=${n}`);
      if (!response.ok) throw new Error("failed");
      setPreview((await response.json()) as Preview);
    } catch {
      setMessage({ tone: "error", text: "Could not count them. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/storage/prune", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: n, includeMatched, confirm }),
      });
      const data = (await response.json().catch(() => ({}))) as { deleted?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "failed");
      setMessage({ tone: "ok", text: `Deleted ${(data.deleted ?? 0).toLocaleString()} stories. The space is reusable by new stories at once; the file only shrinks after a VACUUM FULL.` });
      setPreview(null);
      setConfirm("");
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not delete." });
    } finally {
      setBusy(false);
    }
  }

  const willDelete = preview ? preview.unmatchedStories + (includeMatched ? preview.matchedStories : 0) : 0;
  const canDelete = valid && preview !== null && willDelete > 0 && (!includeMatched || confirm === "DELETE") && !busy;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <p className="text-sm font-semibold text-foreground">Free space now</p>
      <p className="text-xs text-muted-foreground">
        Deletes stored stories older than the days you choose (0 = all of them). Stories no customer&apos;s monitoring matched are only a cache and
        can be re-fetched; nothing else is touched.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="prune-days">Older than (days)</Label>
          <Input
            id="prune-days"
            inputMode="numeric"
            className="w-28"
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setPreview(null);
            }}
          />
        </div>
        <Button type="button" variant="secondary" onClick={check} disabled={!valid || busy}>
          Count first
        </Button>
      </div>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" className="mt-1" checked={includeMatched} onChange={(e) => setIncludeMatched(e.target.checked)} />
        <span>
          Also delete stories customers&apos; monitorings matched — <strong>their mentions disappear with them and this cannot be undone</strong>.
        </span>
      </label>
      {preview ? (
        <p role="status" className="text-sm text-foreground">
          {preview.unmatchedStories.toLocaleString()} unmatched stories
          {includeMatched ? (
            <>
              {" "}+ {preview.matchedStories.toLocaleString()} matched stories ({preview.mentions.toLocaleString()} mentions)
            </>
          ) : (
            <span className="text-muted-foreground"> ({preview.matchedStories.toLocaleString()} matched stories are kept)</span>
          )}{" "}
          older than {n} days will be deleted.
        </p>
      ) : null}
      {includeMatched ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="prune-confirm">Type DELETE to confirm</Label>
          <Input id="prune-confirm" className="w-40" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </div>
      ) : null}
      <div>
        <Button type="button" variant="secondary" onClick={run} disabled={!canDelete}>
          {busy ? "Working…" : `Delete ${willDelete.toLocaleString()} stories`}
        </Button>
      </div>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm ${message.tone === "error" ? "text-danger" : "text-success"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
