import { parseKeywordSpec } from "./keyword-match";
import { turkishFold } from "./turkish";

/**
 * A "concept" is one thing a monitoring tracks under several names: BTM = Bilgiyi Ticarileştirme
 * Merkezi, İTO = İstanbul Ticaret Odası. Matching is unchanged (every name is still an ordinary
 * keyword); concepts only decide how results are GROUPED, so the same entity is read in one place
 * instead of once per spelling.
 */
export type Concept = {
  /** What the group is called: its first name. */
  label: string;
  /** Every name of it (the label first). */
  variants: string[];
};

/** Compare names regardless of case, Turkish letters' dots and a trailing `*`. */
export function conceptKey(term: string): string {
  const { core } = parseKeywordSpec(term);
  return turkishFold(core).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Trim, drop empty names and repeats, and keep only groups with at least two different names. */
export function normalizeAliasGroups(groups: readonly (readonly string[])[] | null | undefined): string[][] {
  const out: string[][] = [];
  const claimed = new Set<string>();
  for (const group of groups ?? []) {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const raw of group) {
      const name = raw.trim();
      const key = conceptKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    // A name can belong to one concept only: the first group that claims it keeps it.
    const free = names.filter((name) => !claimed.has(conceptKey(name)));
    if (free.length < 2) continue;
    for (const name of free) claimed.add(conceptKey(name));
    out.push(free);
  }
  return out;
}

/** The concept a matched term belongs to (itself alone when it is in no group). */
export function conceptOfTerm(aliasGroups: readonly (readonly string[])[] | null | undefined, term: string): Concept {
  const key = conceptKey(term);
  for (const group of aliasGroups ?? []) {
    if (group.some((name) => conceptKey(name) === key)) {
      return { label: group[0] ?? term, variants: [...group] };
    }
  }
  return { label: term, variants: [term] };
}

const NOISE_WORDS = new Set(["ve", "and", "of", "the", "ile", "for", "de", "da"]);

/** Initials of a multi-word name — "İstanbul Ticaret Odası" → "ito", "Bilgiyi Ticarileştirme Merkezi" → "btm". */
export function initialsOf(name: string): string {
  const words = turkishFold(name)
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !NOISE_WORDS.has(word));
  return words.length >= 2 ? words.map((word) => word[0]).join("") : "";
}

/**
 * Names in the list that look like the same thing: a short abbreviation next to the full name it
 * abbreviates (BTM + Bilgiyi Ticarileştirme Merkezi). Suggestions only — the customer confirms —
 * and never for names already grouped together.
 */
export function suggestAliasGroups(terms: readonly string[], existing: readonly (readonly string[])[] = []): string[][] {
  const grouped = new Set(existing.flatMap((group) => group.map(conceptKey)));
  const suggestions: string[][] = [];
  for (const full of terms) {
    const fullKey = conceptKey(full);
    if (!fullKey.includes(" ") || grouped.has(fullKey)) continue;
    const initials = initialsOf(full);
    if (initials.length < 2) continue;
    for (const short of terms) {
      const shortKey = conceptKey(short);
      if (short === full || grouped.has(shortKey) || shortKey.includes(" ")) continue;
      if (shortKey.replace(/\s/g, "") === initials) suggestions.push([short, full]);
    }
  }
  return normalizeAliasGroups(suggestions);
}
