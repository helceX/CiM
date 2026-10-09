/**
 * Deterministic fake publishers for the crawl benchmark (docs/architecture/CRAWL_COST.md): the same
 * feeds, byte for byte, whichever crawl implementation reads them, so two runs are comparable.
 *
 * A feed carries `itemsPerFeed` stories. Between cycles only an "active" share of publishers adds new
 * stories (and drops the oldest); every other feed is byte-identical to its last answer — which is what
 * most real feeds look like between two visits two hours apart.
 */

export function rng(seed: number): () => number {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = [
  "ka", "ra", "mi", "ta", "şe", "nu", "ğı", "lo", "bu", "çe", "dö", "ve", "si", "ar", "ün", "el", "ok", "ıl", "pa", "yo",
  "ze", "han", "lar", "ler", "mak", "ınd", "eti", "yet", "ası", "lık", "tek", "nol", "oji", "pro", "ekon", "mi", "bank",
  "yat", "ırım", "hiz", "met", "pazar", "gir", "iş", "im", "ger", "çek", "tüm", "yeni", "ana", "son", "dün", "bug", "ün",
];

/** A pseudo-Turkish vocabulary: a few thousand distinct words, picked with a Zipf-like skew. */
export function makeVocabulary(size = 3000): string[] {
  const random = rng(12345);
  const words = new Set<string>();
  while (words.size < size) {
    const parts = 2 + Math.floor(random() * 3);
    let word = "";
    for (let i = 0; i < parts; i += 1) word += SYLLABLES[Math.floor(random() * SYLLABLES.length)];
    words.add(word);
  }
  return [...words];
}

export function zipfPick(random: () => number, size: number): number {
  // index ~ size * u^3 : low indexes (common words) are far more likely.
  return Math.min(size - 1, Math.floor(size * Math.pow(random(), 3)));
}

export type BenchScale = {
  sources: number;
  itemsPerFeed: number;
  monitorings: number;
  /** Percent of publishers that add new stories each cycle. */
  activePercent: number;
  newPerActiveCycle: number;
  /** Chance that a story names one of the brands the monitorings look for. */
  brandRate: number;
  /** Shifts every story id, so a run can publish stories no earlier run has stored. */
  idBase: number;
};

export const DEFAULT_SCALE: BenchScale = {
  sources: 400,
  itemsPerFeed: 40,
  monitorings: 200,
  activePercent: 20,
  newPerActiveCycle: 2,
  brandRate: 0.03,
  idBase: 0,
};

export function brandToken(index: number): string {
  return `Markax${String(index).padStart(4, "0")}`;
}

const vocabulary = makeVocabulary();
const RUN_BASE = Math.floor(Date.now() / 3_600_000) * 3_600_000;

function capitalise(word: string): string {
  return word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1);
}

export type FakeItem = { id: number; title: string; description: string; link: string; publishedAt: Date };

function itemOf(sourceIndex: number, itemId: number, scale: BenchScale, host: string): FakeItem {
  const random = rng(sourceIndex * 1_000_003 + itemId * 7919 + 17);
  const words = (count: number) => Array.from({ length: count }, () => vocabulary[zipfPick(random, vocabulary.length)]!);
  const titleWords = words(6 + Math.floor(random() * 5));
  if (random() < scale.brandRate) titleWords.splice(Math.floor(random() * titleWords.length), 0, brandToken(Math.floor(random() * scale.monitorings)));
  const title = capitalise(titleWords.join(" "));
  const descriptionWords = words(28 + Math.floor(random() * 20));
  if (random() < scale.brandRate / 2) descriptionWords.splice(Math.floor(random() * descriptionWords.length), 0, brandToken(Math.floor(random() * scale.monitorings)));
  const description = `${capitalise(descriptionWords.join(" "))}.`;
  const slug = titleWords.slice(0, 4).join("-").toLowerCase().replace(/[^a-z0-9ğüşıöç-]/g, "");
  return {
    id: itemId,
    title,
    description,
    link: `https://${host}/haber/${2026}/${slug}-${itemId}`,
    // Recent and stable for the whole run: the newest of ~100 stories is about now, the oldest a day and a half old.
    publishedAt: new Date(RUN_BASE - (100 - (itemId - scale.idBase)) * 20 * 60_000 + sourceIndex * 1000),
  };
}

export function isActive(sourceIndex: number, scale: BenchScale): boolean {
  return (sourceIndex * 2654435761) % 100 < scale.activePercent;
}

/** How many stories source `sourceIndex` has published by `cycle` (cycle 0 = the first visit). */
export function publishedCount(sourceIndex: number, cycle: number, scale: BenchScale): number {
  return scale.itemsPerFeed + (isActive(sourceIndex, scale) ? cycle * scale.newPerActiveCycle : 0);
}

export function hostOf(sourceIndex: number): string {
  return `feed${sourceIndex}.bench.example`;
}

export function feedUrl(sourceIndex: number): string {
  return `https://${hostOf(sourceIndex)}/rss.xml`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type FakeFeed = {
  body: string;
  etag: string | null;
  lastModified: string | null;
};

export function renderFeed(sourceIndex: number, cycle: number, scale: BenchScale): FakeFeed {
  const host = hostOf(sourceIndex);
  const newest = publishedCount(sourceIndex, cycle, scale);
  const items: FakeItem[] = [];
  for (let id = newest; id > newest - scale.itemsPerFeed; id -= 1) items.push(itemOf(sourceIndex, id + scale.idBase, scale, host));
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">\n` +
    `<channel>\n<title>${escapeXml(`Yayıncı ${sourceIndex}`)}</title>\n<link>https://${host}/</link>\n<description>Bench feed</description>\n` +
    items
      .map(
        (item) =>
          `<item>\n<title>${escapeXml(item.title)}</title>\n<link>${item.link}</link>\n<guid isPermaLink="true">${item.link}</guid>\n` +
          `<pubDate>${item.publishedAt.toUTCString()}</pubDate>\n<dc:creator>Muhabir ${item.id % 17}</dc:creator>\n` +
          `<description><![CDATA[<p>${item.description}</p><p><a href="${item.link}">Devamı</a></p>]]></description>\n</item>`,
      )
      .join("\n") +
    `\n</channel>\n</rss>\n`;
  return {
    body,
    // Six in ten publishers answer conditional requests, eight in ten send Last-Modified (a typical mix).
    etag: sourceIndex % 10 < 6 ? `"v${newest}"` : null,
    lastModified: sourceIndex % 10 < 8 ? (items[0] ?? itemOf(sourceIndex, newest + scale.idBase, scale, host)).publishedAt.toUTCString() : null,
  };
}
