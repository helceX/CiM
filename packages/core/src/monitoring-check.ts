import { turkishFold } from "./turkish";

/**
 * "Why is my monitoring quiet?" — the pure parts of the check on the Monitoring page.
 * The database side (packages/db monitoring-check.ts) gathers the facts; this module turns
 * keywords into a full-text query and the facts into a plain-language verdict.
 */

const TOKEN = /[\p{L}\p{N}]+/gu;

/**
 * A Postgres `to_tsquery('simple', …)` string that finds stored stories containing the words of
 * any of `terms`: the words of one term are ANDed, every word is a word *start* (so endings —
 * girişimci → girişimcilerin — are found too) and the terms are ORed. Text is folded the way the
 * stored search vector was (Turkish-aware). One-letter words carry no signal and are dropped; a
 * term left with no word is skipped. Null when nothing is left to search for.
 *
 * It is a superset of what the exact matching rules accept (no capital rule, no exclusions), so
 * it is only used to find candidates that the exact rules then judge.
 */
export function termsToTsQuery(terms: readonly string[]): string | null {
  const parts: string[] = [];
  for (const term of terms) {
    const words = (turkishFold(term).match(TOKEN) ?? []).filter((word) => [...word].length >= 2);
    if (words.length === 0) continue;
    parts.push(`(${words.map((word) => `${word}:*`).join(" & ")})`);
  }
  return parts.length > 0 ? parts.join(" | ") : null;
}

/** What the database measured for one monitoring. */
export type MonitoringCheckFacts = {
  sources: {
    /** Sources the monitoring can read: active ones of its source types inside its region. */
    inScope: number;
    /** Every active source. */
    active: number;
  };
  crawl: {
    /** Minutes since any source was last scanned; null when none ever was. */
    minutesSinceLastScan: number | null;
  };
  stories: {
    /** Stories collected in the last 24 hours from the sources in scope. */
    last24h: number;
  };
  /** How often each keyword's words appear in stories collected from the sources in scope. */
  keywords: { term: string; last24h: number; last7d: number }[];
  mentions: { last24h: number; last7d: number; total: number };
  /** Alert rules on this monitoring — notifications come only from these. */
  alerts: { active: number; total: number };
  missed: {
    /** Stories collected after the monitoring was last saved that its rules accept but it does not hold. */
    count: number;
    /** How many candidate stories were judged. */
    checked: number;
  };
};

export type MonitoringVerdict = {
  /** problem: something is broken or cannot work; quiet: working, nothing to report; ok: stories are arriving. */
  level: "problem" | "quiet" | "ok";
  headline: string;
  advice: string[];
};

/** A crawler that has not scanned anything for this long is treated as stopped (sources are polled every 2 hours). */
export const CRAWL_STALE_MINUTES = 4 * 60;

function minutesLabel(minutes: number): string {
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} hours` : `${Math.round(hours / 24)} days`;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : pluralForm}`;
}

/**
 * The first thing wrong, in the order a person would look: sources, crawler, collection, saving — then "quiet" or "ok".
 * Whatever the outcome, a monitoring with no active alert rule is told that it sends no notifications: stories
 * arriving and being told about them are different things.
 */
export function explainMonitoringCheck(facts: MonitoringCheckFacts): MonitoringVerdict {
  const verdict = explainStories(facts);
  if (facts.alerts.active === 0) {
    verdict.advice.push(
      facts.alerts.total === 0
        ? "No alert rule is set on this monitoring, so it sends no notifications even when stories arrive — create one under Alerts."
        : "Every alert rule on this monitoring is paused, so it sends no notifications — resume one under Alerts.",
    );
  }
  return verdict;
}

function explainStories(facts: MonitoringCheckFacts): MonitoringVerdict {
  if (facts.sources.inScope === 0) {
    return {
      level: "problem",
      headline: "No active source matches this monitoring's source types and region, so nothing can reach it.",
      advice: ["Edit the monitoring and choose more kinds of source, or a wider region (Worldwide)."],
    };
  }
  const { minutesSinceLastScan } = facts.crawl;
  if (minutesSinceLastScan === null || minutesSinceLastScan > CRAWL_STALE_MINUTES) {
    return {
      level: "problem",
      headline:
        minutesSinceLastScan === null
          ? "No source has been scanned yet, so no stories can arrive."
          : `The crawler last scanned ${minutesLabel(minutesSinceLastScan)} ago — sources are meant to be scanned every 2 hours, so nothing new can arrive.`,
      advice: ["This is not specific to this monitoring: check the worker service (Admin → Overview → queues, and the worker's logs)."],
    };
  }
  if (facts.stories.last24h === 0) {
    return {
      level: "problem",
      headline: "The crawler is running, but it collected no stories from this monitoring's sources in the last 24 hours.",
      advice: ["Open Admin → Sources and look at the status of the sources of these kinds in this region."],
    };
  }
  if (facts.missed.count > 0) {
    return {
      level: "problem",
      headline: `${plural(facts.missed.count, "story", "stories")} collected after this monitoring was saved match its keywords but are not in it.`,
      advice: ["This should not happen. Send this page to support — it names the stories below."],
    };
  }

  const hits24h = facts.keywords.reduce((sum, keyword) => sum + keyword.last24h, 0);
  const hits7d = facts.keywords.reduce((sum, keyword) => sum + keyword.last7d, 0);
  const scope = `${plural(facts.stories.last24h, "story", "stories")} from ${plural(facts.sources.inScope, "source")} in the last 24 hours`;
  if (facts.mentions.last24h > 0) {
    return {
      level: "ok",
      headline: `Working: ${scope} were checked and ${plural(facts.mentions.last24h, "mention")} reached this monitoring.`,
      advice: [],
    };
  }
  const advice = [
    hits7d === 0
      ? "None of the keywords' words appeared in any collected story in the last 7 days — a rare name can be quiet for days. Add other names people use for it (short form, product names, the founder's name)."
      : `The keywords' words did appear in ${plural(hits7d, "story", "stories")} over the last 7 days, but not in the last 24 hours.`,
  ];
  if (hits24h > 0) {
    advice.push(
      `${plural(hits24h, "story", "stories")} in the last 24 hours contain a keyword's words but not as a whole word or with the capitals your keyword asks for (an ALL-CAPS keyword such as BTM is matched exactly).`,
    );
  }
  return {
    level: "quiet",
    headline: `Running normally: ${scope} were checked and none of them contained this monitoring's keywords.`,
    advice,
  };
}
