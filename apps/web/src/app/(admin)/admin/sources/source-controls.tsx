"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@cim/ui";
import { COUNTRIES, SOCIAL_FEED_PLATFORMS, buildGoogleTrendsFeedUrl, buildSocialFeed, type CatalogSource } from "@cim/core";

type NewSource = {
  name: string;
  url: string;
  connector: "rss" | "sitemap" | "api" | "google-trends";
  apiKey: string;
  apiKeyHeaderName: string;
  type: string;
  language: string;
  country: string;
};

export async function post(path: string, body: unknown) {
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

export function AddSourceForm({ countryCodes, defaultCountry = "TR" }: { countryCodes?: string[]; defaultCountry?: string } = {}) {
  const router = useRouter();
  const countryChoices = countryCodes ? COUNTRIES.filter((country) => countryCodes.includes(country.code)) : COUNTRIES;
  const initialCountry = countryChoices.some((country) => country.code === defaultCountry)
    ? defaultCountry
    : (countryChoices[0]?.code ?? defaultCountry);
  const [form, setForm] = useState<NewSource>({
    name: "",
    url: "",
    connector: "rss",
    apiKey: "",
    apiKeyHeaderName: "Authorization",
    type: "news",
    language: "tr",
    country: initialCountry,
  });
  const [busy, setBusy] = useState<"test" | "add" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Shown only after the server says this is a licensed news agency.
  const [needsLicense, setNeedsLicense] = useState(false);
  const [licenseConfirmed, setLicenseConfirmed] = useState(false);

  function update<K extends keyof NewSource>(key: K, value: NewSource[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value } as NewSource;
      if (key === "country" && current.connector === "google-trends") {
        next.url = buildGoogleTrendsFeedUrl(String(value)) ?? "";
      }
      return next;
    });
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
        ...(form.connector === "api" && form.apiKey ? { apiKey: form.apiKey, apiKeyHeaderName: form.apiKeyHeaderName } : {}),
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
      const { apiKey, apiKeyHeaderName, ...rest } = form;
      const { ok, data } = await post("/api/admin/sources", {
        ...rest,
        ...(form.connector === "api" && apiKey ? { apiKey, apiKeyHeaderName } : {}),
        licenseConfirmed,
      });
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
        <Label htmlFor="source-url">{form.connector === "api" ? "Provider endpoint (JSON)" : "Feed or sitemap address"}</Label>
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
          onChange={(e) => {
            const connector = e.target.value as NewSource["connector"];
            setForm((current) => ({
              ...current,
              connector,
              ...(connector === "google-trends"
                ? { type: "trends", name: current.name || "Google Trends", url: buildGoogleTrendsFeedUrl(current.country) ?? "" }
                : {}),
            }));
            setMessage(null);
          }}
        >
          <option value="rss">RSS / Atom feed</option>
          <option value="sitemap">Sitemap</option>
          <option value="api">Clipping / data provider (JSON API)</option>
          <option value="google-trends">Google Trends RSS (geo only)</option>
        </select>
      </div>
      {form.connector === "api" ? (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="source-api-key">API key (optional)</Label>
            <Input
              id="source-api-key"
              type="password"
              autoComplete="off"
              value={form.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder="Never shown again after saving"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="source-api-header">Header the key is sent in</Label>
            <Input
              id="source-api-header"
              value={form.apiKeyHeaderName}
              onChange={(e) => update("apiKeyHeaderName", e.target.value)}
              placeholder="Authorization (Bearer) or X-Api-Key"
            />
          </div>
        </>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="source-type">Source type</Label>
        <select
          id="source-type"
          className={select}
          value={form.type}
          onChange={(e) => update("type", e.target.value)}
        >
          <option value="news">Digital news</option>
          <option value="newspaper">Newspaper</option>
          <option value="magazine">Magazine</option>
          <option value="press">News agency</option>
          <option value="blog">Blog</option>
          <option value="website">Website</option>
          <option value="forum">Forum</option>
          <option value="comments">Comments</option>
          <option value="trends">Google Trends</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="source-country">Country</Label>
        <select
          id="source-country"
          className={select}
          value={form.country}
          onChange={(e) => update("country", e.target.value)}
        >
          {countryChoices.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
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
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="es">Spanish</option>
          <option value="ar">Arabic</option>
          <option value="ru">Russian</option>
          <option value="other">Other</option>
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

/**
 * Follow a public social feed: pick the platform and what to follow, and the
 * feed address is built for you. The address is fetch-tested before anything is
 * stored, exactly like any other source.
 */
export function AddSocialFeedForm() {
  const router = useRouter();
  const [platformKey, setPlatformKey] = useState(SOCIAL_FEED_PLATFORMS[0]!.key);
  const platform = SOCIAL_FEED_PLATFORMS.find((entry) => entry.key === platformKey)!;
  const [kindKey, setKindKey] = useState(platform.kinds[0]!.key);
  const kind = platform.kinds.find((entry) => entry.key === kindKey) ?? platform.kinds[0]!;
  const [value, setValue] = useState("");
  const [instance, setInstance] = useState("");
  const [language, setLanguage] = useState("other");
  const [country, setCountry] = useState("ZZ");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const select = "h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground";

  function changePlatform(key: string) {
    setPlatformKey(key);
    setKindKey(SOCIAL_FEED_PLATFORMS.find((entry) => entry.key === key)!.kinds[0]!.key);
    setMessage(null);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const built = buildSocialFeed({ platform: platformKey, kind: kind.key, value, instance });
    if (!built.ok) {
      setMessage({ tone: "error", text: built.error });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { ok, data } = await post("/api/admin/sources", {
        name: built.name,
        url: built.url,
        connector: "rss",
        type: built.sourceType,
        language,
        country,
      });
      if (!ok) {
        setMessage({ tone: "error", text: data.error ?? "Could not add." });
        return;
      }
      setMessage({ tone: "ok", text: `Added (${data.itemCount} items found).` });
      setValue("");
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Could not add." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="grid max-w-2xl gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="social-platform">Platform</Label>
        <select id="social-platform" className={select} value={platformKey} onChange={(e) => changePlatform(e.target.value)}>
          {SOCIAL_FEED_PLATFORMS.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="social-kind">Follow</Label>
        <select id="social-kind" className={select} value={kind.key} onChange={(e) => setKindKey(e.target.value)}>
          {platform.kinds.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
      {kind.needsInstance ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="social-instance">{kind.instanceLabel}</Label>
          <Input
            id="social-instance"
            value={instance}
            onChange={(e) => setInstance(e.target.value)}
            placeholder={platform.key === "rsshub" ? "rsshub.example.com" : "mastodon.social"}
            required
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor="social-value">{kind.valueLabel}</Label>
        <Input id="social-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind.placeholder} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="social-country">Audience region</Label>
        <select id="social-country" className={select} value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="ZZ">Global (no country)</option>
          {COUNTRIES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="social-language">Feed language</Label>
        <select id="social-language" className={select} value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="other">Mixed / other</option>
          <option value="tr">Turkish</option>
          <option value="en">English</option>
          <option value="de">German</option>
          <option value="fr">French</option>
          <option value="es">Spanish</option>
          <option value="ar">Arabic</option>
          <option value="ru">Russian</option>
        </select>
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Testing…" : "Follow feed"}
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

export type CatalogEntry = { key: string; name: string; url: string; group: string; type: string; language: string; country: string };

export type BulkOutcome = { added: number; skipped: number; failed: { name: string; error: string }[] };

/**
 * The Türkiye feed catalog: search, filter by category, add one feed, or add
 * everything currently shown. Each add is fetch-tested server-side first, so a
 * dead feed is reported and never stored; bulk adds run three at a time.
 */
export function CatalogBrowser({
  entries,
  addedUrls,
  groupLabels,
}: {
  entries: CatalogEntry[];
  addedUrls: string[];
  groupLabels: Record<string, string>;
}) {
  const router = useRouter();
  const added = new Set(addedUrls);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const cancelRef = useRef(false);
  const [limit, setLimit] = useState(60);

  const needle = query.trim().toLocaleLowerCase("tr");
  const shown = entries.filter(
    (entry) =>
      (group === "all" || entry.group === group) &&
      (!needle || entry.name.toLocaleLowerCase("tr").includes(needle) || entry.url.toLowerCase().includes(needle)),
  );
  const pending = shown.filter((entry) => !added.has(entry.url));
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);

  async function addAll() {
    if (
      !window.confirm(
        `Test and add ${pending.length} feeds? Each one is fetched first; feeds that can't be read are skipped. ` +
          "Check the publishers' terms of use before adding mainstream newspapers.",
      )
    ) {
      return;
    }
    setRunning(true);
    cancelRef.current = false;
    setCancelRequested(false);
    setOutcome(null);
    const result: BulkOutcome = { added: 0, skipped: 0, failed: [] };
    const queue = [...pending];
    let done = 0;
    setProgress({ done: 0, total: queue.length });

    async function worker() {
      while (queue.length > 0 && !cancelRef.current) {
        const entry = queue.shift()!;
        try {
          const { ok, data } = await post("/api/admin/sources", {
            name: entry.name,
            url: entry.url,
            connector: "rss",
            type: entry.type,
            language: entry.language,
            country: entry.country,
          });
          if (ok) result.added += 1;
          else if (data.code === "duplicate") result.skipped += 1;
          else result.failed.push({ name: entry.name, error: data.error ?? "Could not add." });
        } catch {
          result.failed.push({ name: entry.name, error: "Network error." });
        }
        done += 1;
        setProgress({ done, total: result.added + result.skipped + result.failed.length + queue.length });
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    setOutcome(result);
    setProgress(null);
    setRunning(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="catalog-search">Search</Label>
          <Input
            id="catalog-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(60);
            }}
            placeholder="Outlet or address"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="catalog-group">Category</Label>
          <select
            id="catalog-group"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setLimit(60);
            }}
          >
            <option value="all">All ({entries.length})</option>
            {Object.entries(groupLabels)
              .filter(([key]) => counts.has(key))
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label} ({counts.get(key)})
                </option>
              ))}
          </select>
        </div>
        <Button type="button" variant="secondary" onClick={addAll} disabled={running || pending.length === 0}>
          {running ? "Adding…" : `Test & add all shown (${pending.length})`}
        </Button>
        {running ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              cancelRef.current = true;
              setCancelRequested(true);
            }}
            disabled={cancelRequested}
          >
            {cancelRequested ? "Stopping…" : "Stop"}
          </Button>
        ) : null}
      </div>

      {progress ? (
        <p role="status" className="text-sm text-muted-foreground">
          Testing feeds… {progress.done} of {progress.total}
        </p>
      ) : null}
      {outcome ? (
        <div role="status" className="rounded-lg border border-border p-3 text-sm">
          <p className="text-foreground">
            Added {outcome.added}, already present {outcome.skipped}, could not add {outcome.failed.length}.
          </p>
          {outcome.failed.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-muted-foreground">Show feeds that failed</summary>
              <ul className="mt-2 max-h-64 overflow-auto text-xs text-muted-foreground">
                {outcome.failed.map((item) => (
                  <li key={item.name + item.error}>
                    {item.name}: {item.error}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {shown.length} feeds match · {shown.length - pending.length} already added
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {shown.slice(0, limit).map((entry) => (
          <li
            key={entry.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{entry.name}</div>
              <div className="truncate text-xs text-muted-foreground">{entry.url}</div>
            </div>
            {added.has(entry.url) ? (
              <span className="shrink-0 text-xs font-medium text-success">Added</span>
            ) : (
              <CatalogAddButton
                entry={{ ...entry, type: entry.type as "news", language: entry.language as "tr", country: "TR", group: entry.group as "general" }}
              />
            )}
          </li>
        ))}
      </ul>
      {shown.length > limit ? (
        <Button type="button" variant="ghost" onClick={() => setLimit((n) => n + 60)}>
          Show more ({shown.length - limit} left)
        </Button>
      ) : null}
    </div>
  );
}
