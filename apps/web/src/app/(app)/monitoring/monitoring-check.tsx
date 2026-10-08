"use client";

import { useState } from "react";
import { Button } from "@cim/ui";

type Verdict = { level: "problem" | "quiet" | "ok"; headline: string; advice: string[] };
type Check = {
  verdict: Verdict;
  sources: { inScope: number; active: number };
  crawl: { minutesSinceLastScan: number | null };
  stories: { last24h: number };
  keywords: { term: string; last24h: number; last7d: number }[];
  mentions: { last24h: number; last7d: number; total: number };
  alerts: { active: number; total: number; lastFiredAt: string | null };
  missed: { count: number; checked: number };
  missedSamples: { title: string; sourceName: string; fetchedAt: string }[];
};
type State = { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; check: Check };

const TONE: Record<Verdict["level"], string> = {
  problem: "border-danger/50 bg-danger/10",
  quiet: "border-border bg-secondary/40",
  ok: "border-success/50 bg-success/10",
};
const LEVEL_LABEL: Record<Verdict["level"], string> = { problem: "Needs attention", quiet: "Running, nothing new", ok: "Working" };

const number = (value: number) => value.toLocaleString("en-US");

function sinceLabel(minutes: number | null): string {
  if (minutes === null) return "never";
  if (minutes < 2) return "just now";
  if (minutes < 90) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
}

/**
 * "Is it running? Why so few stories?" — loads, on request, what the system measured for one monitoring:
 * the sources it can read, whether the crawler is scanning, the stories collected, how often its keywords
 * appear in them and what it holds. Measured when the button is pressed, never on page load.
 */
export function MonitoringCheck({ queryId, name }: { queryId: string; name: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function run() {
    setState({ status: "loading" });
    try {
      const response = await fetch(`/api/monitoring/${queryId}/check`);
      const body = (await response.json().catch(() => null)) as (Check & { error?: string }) | null;
      if (!response.ok || !body?.verdict) {
        setState({ status: "error", message: body?.error ?? "The check could not be completed. Try again." });
        return;
      }
      setState({ status: "ready", check: body });
    } catch {
      setState({ status: "error", message: "The check could not be completed. Try again." });
    }
  }

  const loading = state.status === "loading";
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" size="sm" variant="secondary" onClick={run} disabled={loading} aria-label={`Check this monitoring: ${name}`}>
          {loading ? "Checking…" : state.status === "ready" ? "Check again" : "Check this monitoring"}
        </Button>
      </div>
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {state.status === "error" ? <p className="text-xs text-danger">{state.message}</p> : null}
        {state.status === "ready" ? <CheckResult check={state.check} /> : null}
      </div>
    </div>
  );
}

function CheckResult({ check }: { check: Check }) {
  const { verdict } = check;
  return (
    <div className={`flex flex-col gap-3 rounded-lg border p-3 text-xs ${TONE[verdict.level]}`}>
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{LEVEL_LABEL[verdict.level]}</p>
        <p className="text-sm font-medium text-foreground">{verdict.headline}</p>
        {verdict.advice.length > 0 ? (
          <ul className="list-disc pl-4 text-muted-foreground">
            {verdict.advice.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <Row label="Sources it can read" value={`${number(check.sources.inScope)} of ${number(check.sources.active)} active sources`} />
        <Row label="Crawler last scanned" value={sinceLabel(check.crawl.minutesSinceLastScan)} />
        <Row label="Stories collected from them, last 24 hours" value={number(check.stories.last24h)} />
        <Row
          label="Held by this monitoring"
          value={`${number(check.mentions.last24h)} in 24 h · ${number(check.mentions.last7d)} in 7 days · ${number(check.mentions.total)} in total`}
        />
        <Row
          label="Alert rules (notifications) on this monitoring"
          value={
            check.alerts.total === 0
              ? "none — it sends no notifications"
              : `${number(check.alerts.active)} active of ${number(check.alerts.total)}${
                  check.alerts.lastFiredAt ? ` · last fired ${new Date(check.alerts.lastFiredAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : " · never fired"
                }`
          }
        />
        <Row
          label="Matching stories it is missing"
          value={check.missed.checked === 0 ? "none to judge" : `${number(check.missed.count)} (of ${number(check.missed.checked)} candidates judged)`}
        />
      </dl>

      {check.keywords.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">How often each keyword&apos;s words appear in the collected stories</p>
          <ul className="flex flex-col gap-0.5 text-muted-foreground">
            {check.keywords.map((keyword) => (
              <li key={keyword.term}>
                <span className="font-medium text-foreground">{keyword.term}</span> — {number(keyword.last24h)} in 24 h · {number(keyword.last7d)} in 7 days
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            These counts look for the words in headlines and stored excerpts, in any capitals, so they can be higher than what the monitoring accepts (an ALL-CAPS keyword matches only the exact capitals).
          </p>
        </div>
      ) : null}

      {check.missedSamples.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">Stories that match but are not held</p>
          <ul className="list-disc pl-4 text-muted-foreground">
            {check.missedSamples.map((sample) => (
              <li key={`${sample.title}-${sample.fetchedAt}`}>
                {sample.title} — {sample.sourceName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
