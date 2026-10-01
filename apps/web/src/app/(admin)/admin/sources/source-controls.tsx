"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@cim/ui";
import type { CatalogSource } from "@cim/core";

type NewSource = {
  name: string;
  url: string;
  connector: "rss" | "sitemap";
  type: string;
  language: string;
  country: string;
};

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    itemCount?: number;
    ok?: boolean;
    sampleTitles?: string[];
    message?: string;
  };
  return { ok: response.ok, data };
}

export function CatalogAddButton({ entry }: { entry: CatalogSource }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setState("busy");
    setError(null);
    try {
      const { ok, data } = await post("/api/admin/sources", {
        name: entry.name,
        url: entry.url,
        connector: "rss",
        type: entry.type,
        language: entry.language,
        country: entry.country,
      });
      if (!ok) {
        setError(data.error ?? "Could not add.");
        setState("error");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not add.");
      setState("error");
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={add}
        disabled={state === "busy"}
        aria-label={`Add ${entry.name}`}
      >
        {state === "busy" ? "Testing…" : "Test & add"}
      </Button>
      {error ? (
        <p role="alert" className="max-w-48 text-right text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AddSourceForm() {
  const router = useRouter();
  const [form, setForm] = useState<NewSource>({
    name: "",
    url: "",
    connector: "rss",
    type: "news",
    language: "tr",
    country: "TR",
  });
  const [busy, setBusy] = useState<"test" | "add" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Shown only after the server says this is a licensed news agency.
  const [needsLicense, setNeedsLicense] = useState(false);
  const [licenseConfirmed, setLicenseConfirmed] = useState(false);

  function update<K extends keyof NewSource>(key: K, value: NewSource[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
    if (key === "url") {
      setNeedsLicense(false);
      setLicenseConfirmed(false);
    }
  }

  async function test() {
    setBusy("test");
    setMessage(null);
    try {
      const { ok, data } = await post("/api/admin/sources/test", {
        url: form.url,
        connector: form.connector,
      });
      if (!ok) {
        setMessage({ tone: "error", text: data.error ?? "Could not test." });
      } else if (data.ok) {
        const sample = data.sampleTitles?.length ? ` e.g. “${data.sampleTitles[0]}”` : "";
        setMessage({ tone: "ok", text: `Readable: ${data.itemCount} items found.${sample}` });
      } else {
        setMessage({ tone: "error", text: data.message ?? "Could not read it." });
      }
    } catch {
      setMessage({ tone: "error", text: "Could not test." });
    } finally {
      setBusy(null);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy("add");
    setMessage(null);
    try {
      const { ok, data } = await post("/api/admin/sources", { ...form, licenseConfirmed });
      if (!ok) {
        if (data.code === "license_required") setNeedsLicense(true);
        setMessage({ tone: "error", text: data.error ?? "Could not add." });
        return;
      }
      setMessage({ tone: "ok", text: `Added (${data.itemCount} items found).` });
      setForm((current) => ({ ...current, name: "", url: "" }));
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Could not add." });
    } finally {
      setBusy(null);
    }
  }

  const select =
    "h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground";

  return (
    <form onSubmit={add} className="grid max-w-2xl gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="source-name">Name</Label>
        <Input
          id="source-name"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
          maxLength={120}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="source-url">Feed or sitemap address</Label>
        <Input
          id="source-url"
          type="url"
          placeholder="https://example.com/rss.xml"
          value={form.url}
          onChange={(e) => update("url", e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="source-connector">Kind</Label>
        <select
          id="source-connector"
          className={select}
          value={form.connector}
          onChange={(e) => update("connector", e.target.value as NewSource["connector"])}
        >
          <option value="rss">RSS / Atom feed</option>
          <option value="sitemap">Sitemap</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="source-type">Source type</Label>
        <select
          id="source-type"
          className={select}
          value={form.type}
          onChange={(e) => update("type", e.target.value)}
        >
          <option value="news">News</option>
          <option value="press">Press agency</option>
          <option value="blog">Blog</option>
          <option value="website">Website</option>
          <option value="forum">Forum</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="source-language">Language</Label>
        <select
          id="source-language"
          className={select}
          value={form.language}
          onChange={(e) => update("language", e.target.value)}
        >
          <option value="tr">Turkish</option>
          <option value="en">English</option>
        </select>
      </div>
      <div className="flex items-end gap-2">
        <Button type="button" variant="secondary" onClick={test} disabled={busy !== null || !form.url}>
          {busy === "test" ? "Testing…" : "Test"}
        </Button>
        <Button type="submit" disabled={busy !== null}>
          {busy === "add" ? "Adding…" : "Test & add"}
        </Button>
      </div>
      {needsLicense ? (
        <label className="flex items-start gap-2 text-sm text-foreground sm:col-span-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={licenseConfirmed}
            onChange={(e) => setLicenseConfirmed(e.target.checked)}
          />
          Mediaory holds a written licence from this news agency that allows this use.
        </label>
      ) : null}
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

export function CrawlToggle({ id, name, paused }: { id: string; name: string; paused: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const { ok } = await post(`/api/admin/sources/${id}/crawl`, { enabled: paused });
      if (ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={toggle}
      disabled={busy}
      aria-label={`${paused ? "Resume" : "Pause"} crawling ${name}`}
    >
      {paused ? "Resume" : "Pause"}
    </Button>
  );
}
