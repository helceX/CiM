/**
 * Word endings, so that a keyword typed once also finds its inflected forms:
 * "girişimci" → girişimciler, girişimcinin, girişimciye, girişimcilerin, girişimcisi, girişimcilik…;
 * "startup" → startups, startup's (the apostrophe form is a word boundary already), startups'.
 *
 * Each language pack describes a word as a stem followed by optional groups of endings, in the order
 * the language stacks them. The same description produces the regular expression used on running
 * text and the list of concrete forms used against a story's word fingerprint, so the two always
 * agree. Packs are deliberately generous about vowel harmony (every harmony variant is accepted)
 * and strict about length, so a short word is never stretched into unrelated ones. Everything works
 * on text that went through `turkishFold`.
 */
export type FormSpec = {
  stem: string;
  /** optional groups of endings, tried in order; each group contributes one ending or none */
  groups: string[][];
  /** the stem is a softened variant that only exists in front of a vowel ending (kitab-ı) */
  vowelEndingOnly?: boolean;
};

export type MorphologyPack = {
  id: string;
  /** smallest keyword (letters) that is allowed to take endings */
  minLength: number;
  specs(word: string): FormSpec[];
};

const VOWELS = "aeıioöuü";

// ——— Turkish ———
const TR_DERIVATION = ["lik", "lık", "luk", "lük", "ci", "cı", "cu", "cü", "çi", "çı", "çu", "çü", "li", "lı", "lu", "lü", "siz", "sız", "suz", "süz"];
const TR_PLURAL = ["lar", "ler"];
const TR_POSSESSIVE = ["mız", "miz", "muz", "müz", "ımız", "imiz", "umuz", "ümüz", "nız", "niz", "nuz", "nüz", "ınız", "iniz", "unuz", "ünüz", "ları", "leri", "sı", "si", "su", "sü", "ım", "im", "um", "üm", "ın", "in", "un", "ün", "m", "n", "ı", "i", "u", "ü"];
const TR_CASE = ["nın", "nin", "nun", "nün", "ndan", "nden", "nda", "nde", "na", "ne", "ya", "ye", "yı", "yi", "yu", "yü", "yla", "yle", "dan", "den", "tan", "ten", "da", "de", "ta", "te", "ca", "ce", "ça", "çe", "la", "le", "nı", "ni", "nu", "nü", "ın", "in", "un", "ün", "a", "e", "ı", "i", "u", "ü"];
const TR_GROUPS = [TR_DERIVATION, TR_PLURAL, TR_POSSESSIVE, TR_CASE];
const TR_SOFTENING: Record<string, string> = { p: "b", ç: "c", t: "d", k: "ğ" };

const turkish: MorphologyPack = {
  id: "tr",
  minLength: 4,
  specs(word) {
    const specs: FormSpec[] = [{ stem: word, groups: TR_GROUPS }];
    // kitap → kitabı, ağaç → ağacı, çocuk → çocuğu: the last consonant softens before a vowel ending
    const last = word[word.length - 1] ?? "";
    const softened = TR_SOFTENING[last];
    if (softened) specs.push({ stem: word.slice(0, -1) + softened, groups: TR_GROUPS, vowelEndingOnly: true });
    if (last === "k" && word[word.length - 2] === "n") specs.push({ stem: `${word.slice(0, -1)}g`, groups: TR_GROUPS, vowelEndingOnly: true }); // renk → rengi
    return specs;
  },
};

// ——— English ———
const english: MorphologyPack = {
  id: "en",
  minLength: 4,
  specs(word) {
    const specs: FormSpec[] = [{ stem: word, groups: [[/e$/.test(word) ? "d" : "ed", "s", "es", "ing", "er", "ers", "ly", "est"]] }];
    if (/[^aeiou]y$/.test(word)) specs.push({ stem: word.slice(0, -1), groups: [["ies", "ied", "ier", "iers", "iest", "ily"]] }); // company → companies
    if (/e$/.test(word)) specs.push({ stem: word.slice(0, -1), groups: [["ing", "er", "ers"]] }); // create → creating
    if (/[^aeiou][aeiou][^aeiouwxy]$/.test(word)) specs.push({ stem: `${word}${word[word.length - 1]}`, groups: [["ed", "ing", "er", "ers"]] }); // run → running
    return specs;
  },
};

// ——— a few more languages: plural and common noun/adjective endings ———
function simple(id: string, endings: string[], minLength = 5): MorphologyPack {
  return { id, minLength, specs: (word) => [{ stem: word, groups: [endings] }] };
}

const PACKS: Record<string, MorphologyPack> = {
  tr: turkish,
  en: english,
  de: simple("de", ["e", "en", "er", "es", "n", "s", "em"]),
  fr: simple("fr", ["s", "x", "e", "es"]),
  es: simple("es", ["s", "es", "as", "os"]),
  it: simple("it", ["i", "e"]),
  pt: simple("pt", ["s", "es"]),
  nl: simple("nl", ["s", "en", "e"]),
};

/**
 * Which packs apply to a text of this language (an ISO code such as "tr" or "en-GB"). An unknown
 * language gets Turkish and English, the two the product's customers write in; a language with no
 * pack gets none (exact word only).
 */
export function morphologyPacksFor(language?: string | null): MorphologyPack[] {
  const code = language?.trim().toLowerCase().slice(0, 2);
  if (!code) return [PACKS.tr!, PACKS.en!];
  const pack = PACKS[code];
  return pack ? [pack] : [];
}

/** Stable key for caching compiled keywords per set of packs. */
export function morphologyKey(language?: string | null): string {
  return morphologyPacksFor(language).map((pack) => pack.id).join("+");
}

function specsFor(word: string, language?: string | null): FormSpec[] {
  if (/\d/.test(word)) return [];
  const length = [...word].length;
  return morphologyPacksFor(language)
    .filter((pack) => length >= pack.minLength)
    .flatMap((pack) => pack.specs(word));
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex source matching `word` (already folded) and its forms under the packs of `language`, or just the word. */
export function inflectedWordPattern(word: string, language?: string | null): string {
  const specs = specsFor(word, language);
  if (specs.length === 0) return word;
  const alternatives = specs.map((spec) => {
    const groups = spec.groups.map((group) => `(?:${group.map(escapePattern).join("|")})?`).join("");
    return `${escapePattern(spec.stem)}${spec.vowelEndingOnly ? `(?=[${VOWELS}])` : ""}${groups}`;
  });
  return `(?:${[...new Set(alternatives)].join("|")})`;
}

const MAX_FORMS = 250_000;

/** Every concrete form of `word` (the bare word first), for matching against hashed words. */
export function inflectedForms(word: string, language?: string | null): string[] {
  const forms = new Set<string>([word]);
  for (const spec of specsFor(word, language)) {
    let partials = [spec.stem];
    for (const group of spec.groups) {
      const next = [...partials];
      for (const partial of partials) for (const ending of group) next.push(partial + ending);
      partials = next;
      if (partials.length > MAX_FORMS) break;
    }
    for (const form of partials) {
      if (spec.vowelEndingOnly && (form.length <= spec.stem.length || !VOWELS.includes(form[spec.stem.length] ?? ""))) continue;
      forms.add(form);
    }
  }
  return [...forms];
}
