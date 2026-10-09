import type { CrawlStatTotals } from "@cim/core";

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

/**
 * What the crawler did in the last 24 hours, from the counters the worker keeps. The point is to judge a change to the crawl
 * on numbers: a feed answered "not modified" or with nothing new costs the publisher, the worker and the database next to
 * nothing, so these shares should be high; failures and backoff skips show sources that are being left alone.
 */
export function CrawlActivity({ stats }: { stats: CrawlStatTotals | null }) {
  if (!stats) {
    return (
      <p className="text-sm text-muted-foreground">Crawl activity is not available right now (the counters could not be read).</p>
    );
  }
  const rows: { label: string; value: string; hint?: string }[] = [
    { label: "Feeds checked", value: stats.checks.toLocaleString() },
    { label: "Not modified (304)", value: `${stats.not_modified.toLocaleString()} · ${pct(stats.not_modified, stats.checks)}`, hint: "Nothing downloaded or stored" },
    { label: "Nothing new", value: `${stats.unchanged.toLocaleString()} · ${pct(stats.unchanged, stats.checks)}`, hint: "Downloaded, every story already handled" },
    { label: "With new stories", value: `${stats.changed.toLocaleString()} · ${pct(stats.changed, stats.checks)}` },
    { label: "Failed", value: `${stats.failed.toLocaleString()} · ${pct(stats.failed, stats.checks)}`, hint: "Could not be read" },
    { label: "Left alone after failures", value: stats.backoff_skips.toLocaleString(), hint: "Waiting 4–24 h before the next try" },
    { label: "Stories left alone", value: `${stats.stories_skipped.toLocaleString()} of ${stats.stories_seen.toLocaleString()}`, hint: "Already handled, not looked up again" },
    { label: "New stories / mentions", value: `${stats.new_articles.toLocaleString()} / ${stats.new_mentions.toLocaleString()}` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label}>
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="tabular-nums text-foreground">{row.value}</dd>
          {row.hint ? <dd className="text-xs text-muted-foreground">{row.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
