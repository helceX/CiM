import { turkishFold } from "./turkish";

/**
 * Story clustering ("who else is covering this", docs/architecture/ADR-004-INGESTION.md): a new story joins the
 * cluster of a look-alike headline another outlet ran in the last two days. The look-alike lookup runs once for
 * every new story, so it has to be cheap — see articles.ts `findSimilarRecentArticle`.
 */

/** How far back a look-alike can be and still be "the same story". */
export const STORY_WINDOW_HOURS = 48;
/** The most candidate stories a lookup compares exactly; the newest ones, which is where a live story's look-alikes are. */
export const STORY_CANDIDATE_LIMIT = 500;
const MAX_QUERY_WORDS = 6;

/**
 * The words a candidate must share with the headline to be worth comparing: the longest distinct words (the
 * most distinctive ones in a headline), folded the way the full-text index folds titles. Numbers alone say
 * nothing; if no word is long enough the shorter ones are used; none at all means "do not look".
 */
export function clusterQueryWords(title: string): string[] {
  const words = [...new Set(turkishFold(title).match(/[\p{L}\p{N}]+/gu) ?? [])].filter((word) => !/^\p{N}+$/u.test(word));
  const byLength = (a: string, b: string) => b.length - a.length || a.localeCompare(b);
  const long = words.filter((word) => [...word].length >= 4).sort(byLength);
  const chosen = long.length > 0 ? long : words.filter((word) => [...word].length >= 3).sort(byLength);
  return chosen.slice(0, MAX_QUERY_WORDS);
}

/** `'a' | 'b'` for `to_tsquery('simple', …)`. The words are letters and digits only, so quoting them is safe. */
export function toTsQueryAny(words: readonly string[]): string {
  return words.map((word) => `'${word}'`).join(" | ");
}

/** A story published before the window cannot have a look-alike worth clustering (and a new source's back catalogue is full of them). */
export function isWithinStoryWindow(publishedAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!publishedAt) return true;
  return now.getTime() - publishedAt.getTime() <= STORY_WINDOW_HOURS * 3_600_000;
}
