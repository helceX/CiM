import { keywordMatches, parseKeywordSpec, prepareText } from "./keyword-match";
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

/** Union-find over names, used to merge groups that share a name. */
function unionGroups(groups: readonly (readonly string[])[]): string[][] {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(key, root);
    return root;
  };
  const names = new Map<string, string>(); // key → first spelling seen
  const order: string[] = [];
  for (const group of groups) {
    for (const name of group) {
      const key = conceptKey(name);
      if (!key) continue;
      if (!parent.has(key)) {
        parent.set(key, key);
        names.set(key, name.trim());
        order.push(key);
      }
    }
    const keys = group.map(conceptKey).filter(Boolean);
    for (let i = 1; i < keys.length; i += 1) parent.set(find(keys[i]!), find(keys[0]!));
  }
  const grouped = new Map<string, string[]>();
  for (const key of order) {
    const root = find(key);
    grouped.set(root, [...(grouped.get(root) ?? []), names.get(key)!]);
  }
  return [...grouped.values()];
}

/** True when `a` is a word form of `b` or the other way round (plural, possessive, case, -ci, -cilik …). */
function sameFamily(a: string, b: string): boolean {
  const aText = prepareText(parseKeywordSpec(a).core);
  const bText = prepareText(parseKeywordSpec(b).core);
  for (const language of ["tr", "en"] as const) {
    if (keywordMatches(a, bText, { language }) || keywordMatches(b, aText, { language })) return true;
  }
  return false;
}

/**
 * Keywords that are forms of one word, found automatically: yatırım · yatırımcı · yatırımcılık,
 * girişimci · girişimcilik · girişimcinin. The shortest name leads the group. Short all-caps
 * abbreviations (THY, AK) and keywords with an explicit `*` are left out — what was typed stays
 * what is matched, and grouping never changes what matches.
 */
export function autoKeywordClusters(terms: readonly string[]): string[][] {
  const candidates = terms.filter((term) => {
    const spec = parseKeywordSpec(term);
    return spec.core.length >= 3 && !spec.caseSensitive && !spec.prefix;
  });
  const pairs: string[][] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      if (conceptKey(candidates[i]!) !== conceptKey(candidates[j]!) && sameFamily(candidates[i]!, candidates[j]!)) {
        pairs.push([candidates[i]!, candidates[j]!]);
      }
    }
  }
  return unionGroups(pairs)
    .filter((group) => group.length >= 2)
    .map((group) => [...group].sort((x, y) => conceptKey(x).length - conceptKey(y).length));
}

/**
 * The groups a monitoring is read by: the customer's own alias groups (BTM = Bilgiyi Ticarileştirme
 * Merkezi) plus the automatic word-form clusters, merged where they share a name. A customer's group
 * keeps its own first name as the label.
 */
export function effectiveAliasGroups(
  aliasGroups: readonly (readonly string[])[] | null | undefined,
  keywords: readonly string[],
): string[][] {
  const explicit = normalizeAliasGroups(aliasGroups);
  const merged = unionGroups([...explicit, ...autoKeywordClusters(keywords)]);
  const explicitFirst = new Map(explicit.map((group) => [conceptKey(group[0]!), group[0]!]));
  return merged
    .filter((group) => group.length >= 2)
    .map((group) => {
      const lead = group.find((name) => explicitFirst.has(conceptKey(name)));
      return lead ? [lead, ...group.filter((name) => name !== lead)] : group;
    });
}

/**
 * The family a monitoring belongs to when no group was chosen: its name without a trailing version
 * ("BTM Monitoring v2", "BTM Monitoring (3)", "BTM Monitoring - 2" → "BTM Monitoring").
 */
export function monitoringFamilyName(name: string): string {
  const trimmed = name.replace(/\s+/g, " ").trim();
  const stripped = trimmed
    .replace(/[\s\-–—_]*\(?\b(?:v|ver|version|sürüm|surum)\.?\s*\d+(?:\.\d+)*\)?$/iu, "")
    .replace(/[\s\-–—_]*\(\d+\)$/u, "")
    .replace(/[\s\-–—_]+\d+$/u, "")
    .trim();
  return stripped.length >= 2 ? stripped : trimmed;
}
