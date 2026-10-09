/**
 * Micro-benchmark for the per-rule alert statistics (docs/architecture/CRAWL_COST.md, F6): runs the spike and
 * sentiment-shift statistics for every monitoring of the scratch benchmark database, the way an evaluator tick does when
 * every rule passes its pre-filter (the worst case), and prints the time and Postgres CPU. Run after
 * `crawl-bench.ts --scenario=alerts` has filled the database, once without and once with the mentions index.
 *
 *   tsx bench/alert-stats-bench.ts [--recent=300]   (adds that many mentions per monitoring in the current hour first)
 */
import { readdirSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import { db, getQuerySentimentShiftStats, getQuerySpikeStats, schema } from "@cim/db";

if (!/bench/i.test(new URL(process.env.DATABASE_URL ?? "").pathname)) {
  throw new Error("Refusing to run: DATABASE_URL must point at a database with 'bench' in its name.");
}

function postgresCpuSeconds(): number {
  let ticks = 0;
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      if (!readFileSync(`/proc/${entry}/cmdline`, "utf8").startsWith("postgres")) continue;
      const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      ticks += Number(fields[11]) + Number(fields[12]);
    } catch {
      // the process ended while we looked
    }
  }
  return ticks / 100;
}

const reference = async (queryId: string) =>
  db.execute(sql`
    with hours as (
      select generate_series(date_trunc('hour', now()) - interval '24 hours', date_trunc('hour', now()) - interval '1 hour', interval '1 hour') as hour
    ), hourly as (
      select h.hour, count(m.id) as cnt from hours h
      left join ${schema.mentions} m on date_trunc('hour', m.created_at) = h.hour and m.query_id = ${queryId}
      group by h.hour
    ), current_hour as (
      select count(*) as cnt from ${schema.mentions} where query_id = ${queryId} and created_at >= date_trunc('hour', now())
    )
    select (select cnt from current_hour) as current_count, avg(hourly.cnt) as baseline_avg, stddev_pop(hourly.cnt) as baseline_stddev from hourly
  `);

const referenceSentiment = async (queryId: string) =>
  db.execute(sql`
    select
      count(*) filter (where created_at >= now() - interval '24 hours' and sentiment is not null) as current_classified,
      count(*) filter (where created_at >= now() - interval '24 hours' and sentiment = 'negative') as current_negative,
      count(*) filter (where created_at < now() - interval '24 hours' and created_at >= now() - interval '8 days' and sentiment is not null) as baseline_classified,
      count(*) filter (where created_at < now() - interval '24 hours' and created_at >= now() - interval '8 days' and sentiment = 'negative') as baseline_negative
    from ${schema.mentions} where query_id = ${queryId}
  `);

const recent = Number(process.argv.find((a) => a.startsWith("--recent="))?.split("=")[1] ?? 0);
if (recent > 0) {
  await db.execute(sql`
    insert into mentions (organization_id, project_id, query_id, article_id, matched_terms, sentiment, created_at)
    select q.organization_id, q.project_id, q.id, a.id, array['bench'], 'negative', date_trunc('hour', now())
    from monitoring_queries q
    cross join lateral (select id from articles tablesample system (1) limit ${recent}) a
    on conflict do nothing
  `);
  await db.execute(sql`analyze mentions`);
}

const queryIds = (await db.select({ id: schema.monitoringQueries.id }).from(schema.monitoringQueries)).map((row) => row.id);
const mentionCount = Number((await db.execute(sql`select count(*) as n from mentions`)).rows[0]?.n);
console.error(`${queryIds.length} monitorings, ${mentionCount} mentions`);

async function run(label: string, work: (queryId: string) => Promise<unknown>) {
  const pg0 = postgresCpuSeconds();
  const t0 = performance.now();
  for (const id of queryIds) await work(id);
  const wall = performance.now() - t0;
  console.error(`  ${label.padEnd(34)} wall ${String(Math.round(wall)).padStart(7)} ms | postgres CPU ${String(Math.round((postgresCpuSeconds() - pg0) * 1000)).padStart(7)} ms`);
}

await run("spike statistics, previous query", reference);
await run("spike statistics, new query", (id) => getQuerySpikeStats(db, id));
await run("sentiment statistics, previous", referenceSentiment);
await run("sentiment statistics, new", (id) => getQuerySentimentShiftStats(db, id));
process.exit(0);
