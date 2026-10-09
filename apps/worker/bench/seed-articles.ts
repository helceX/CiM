/**
 * Fills the scratch benchmark database with a production-sized `articles` table so query plans can be judged
 * on realistic data (docs/architecture/CRAWL_COST.md). Never run against a real database: it truncates, and it
 * refuses any database whose name does not contain "bench".
 *
 *   tsx bench/seed-articles.ts --articles=588000 --recent=40000 --sources=400
 *
 * `--recent` stories are fetched within the last 48 hours (the window the story-clustering lookup scans);
 * the rest are spread over the 30 days before. One story in ten is a look-alike of the previous one from
 * another outlet, as wire stories are.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@cim/db";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v = "true"] = a.slice(2).split("=");
      return [k!, v];
    }),
);
const total = Number(args.articles ?? 588_000);
const recent = Number(args.recent ?? 40_000);
const sourceCount = Number(args.sources ?? 400);

if (!/bench/i.test(new URL(process.env.DATABASE_URL ?? "").pathname)) {
  throw new Error("Refusing to run: DATABASE_URL must point at a database with 'bench' in its name.");
}

await db.execute(sql`truncate table mentions, articles, sources restart identity cascade`);
await db.execute(sql`
  insert into sources (name, domain, url, type, connector, language, country, status, can_display_excerpt)
  select 'Bench ' || g, 'feed' || g || '.bench.example', 'https://feed' || g || '.bench.example/rss.xml', 'news', 'rss', 'tr', 'TR', 'healthy', true
  from generate_series(1, ${sourceCount}) g
`);

// Common words come from real Turkish text (the panel's own Turkish messages), picked with a Zipf-like skew;
// the rare tokens stand for the proper nouns that make a real headline distinctive. Pseudo-words made of
// syllables only would overlap too much and make every trigram look common.
function turkishWords(): string[] {
  const messages = new URL("../../web/messages/", import.meta.url);
  // One tr.json, or (once the catalog is split per area) a tr/ folder of them.
  const files = existsSync(new URL("tr/", messages))
    ? readdirSync(new URL("tr/", messages)).map((name) => new URL(`tr/${name}`, messages))
    : [new URL("tr.json", messages)];
  const counts = new Map<string, number>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const word of text.toLocaleLowerCase("tr-TR").match(/[a-zçğıöşü]{3,}/g) ?? []) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([word]) => word).slice(0, 3000);
}
const words = turkishWords();
const vocab = sql`${JSON.stringify(words)}::jsonb`;
const n = words.length;
const pick = (seed: string, mul: number, mod: number) =>
  sql.raw(`w.a[1 + (floor(${n} * power((((${seed}) * ${mul}) % ${mod}) / ${mod}.0, 3))::int % ${n})]`);
const rare = (seed: string, tag: string) => sql.raw(`translate(substr(md5((${seed})::text || '${tag}'), 1, 7), '0123456789', 'ghjklmnpqr')`);

await db.execute(sql`
  with words as (select array(select jsonb_array_elements_text(${vocab})) as a),
  srcs as (select id, row_number() over (order by id) as n from sources),
  gen as (
    select g,
           case when g % 10 = 0 then g - 1 else g end as common_seed,
           case when g % 10 = 0 or g % 20 = 1 then g - 1 else g end as rare_seed,
           case when g <= ${recent} then now() - (random() * interval '48 hours')
                else now() - interval '48 hours' - (random() * interval '30 days') end as ts
    from generate_series(1::bigint, ${total}::bigint) g
  )
  insert into articles (source_id, canonical_url, content_hash, title, stored_excerpt, language, published_at, fetched_at, created_at, search_vector)
  select s.id,
         'https://bench.example/' || gen.g,
         md5('bench' || gen.g),
         t.title,
         left(t.title || ' ' || t.title, 200),
         'tr',
         gen.ts, gen.ts, gen.ts,
         to_tsvector('simple', t.title)
  from gen
  join srcs s on s.n = (gen.g % ${sourceCount}) + 1
  cross join words w
  cross join lateral (
    select initcap(
      ${pick("gen.common_seed", 2654435761, 1000003)} || ' ' || ${rare("gen.rare_seed", "a")} || ' ' ||
      ${pick("gen.common_seed", 40503, 999983)} || ' ' || ${pick("gen.common_seed", 69069, 999979)} || ' ' ||
      ${rare("gen.rare_seed", "b")} || ' ' || ${pick("gen.common_seed", 1103515245, 999961)} || ' ' ||
      ${rare("gen.rare_seed", "c")} || ' ' || ${pick("gen.common_seed", 214013, 999953)}
    ) as title
  ) t
`);
await db.execute(sql`analyze articles`);
const [row] = (
  await db.execute<{ n: string; recent: string; size: string; indexes: string }>(sql`
    select (select count(*) from articles)::text as n,
           (select count(*) from articles where fetched_at >= now() - interval '48 hours')::text as recent,
           pg_size_pretty(pg_total_relation_size('articles')) as size,
           pg_size_pretty(pg_indexes_size('articles')) as indexes
  `)
).rows;
console.log(`articles: ${row!.n} (${row!.recent} in the last 48 h), table+indexes ${row!.size}, indexes alone ${row!.indexes}`);
process.exit(0);
