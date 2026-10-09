/**
 * Crawl and alert cost benchmark (docs/architecture/CRAWL_COST.md).
 *
 * Runs the real worker code — the crawl job, the scheduler tick, the alert evaluators — against a scratch
 * Postgres and Redis, with fake publishers (fake-feeds.ts) instead of the internet, and reports what each
 * cycle costs: Node CPU, Postgres CPU, statements, rows, memory, event-loop busy share. The same script runs
 * before and after a change, on the same machine, so the two outputs are comparable.
 *
 *   DATABASE_URL=postgres://…/cim_bench REDIS_URL=redis://localhost:6379 SESSION_SECRET=… \
 *     pnpm --filter @cim/worker bench:crawl -- --scenario=crawl --sources=400 --cycles=6 --out=/tmp/crawl.json
 *
 * It truncates the database it is pointed at, so it refuses any database whose name does not contain "bench".
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { sql } from "drizzle-orm";
import { astToBooleanQuery } from "@cim/core";
import { asOrganizationId, createMonitoringQuery, createProject, db, schema } from "@cim/db";
import { DEFAULT_SCALE, brandToken, feedUrl, hostOf, makeVocabulary, renderFeed, type BenchScale } from "./fake-feeds";

type Args = Record<string, string>;
const args: Args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, value = "true"] = arg.slice(2).split("=");
      return [key!, value];
    }),
);

const num = (key: string, fallback: number) => (args[key] !== undefined ? Number(args[key]) : fallback);
const scale: BenchScale = {
  ...DEFAULT_SCALE,
  sources: num("sources", DEFAULT_SCALE.sources),
  itemsPerFeed: num("items", DEFAULT_SCALE.itemsPerFeed),
  monitorings: num("monitorings", DEFAULT_SCALE.monitorings),
  activePercent: num("active", DEFAULT_SCALE.activePercent),
  idBase: num("id-base", 0),
};
const cycles = num("cycles", 6);
const concurrency = num("concurrency", 15);
const scenario = args.scenario ?? "crawl";
const impl = args.impl ?? "baseline";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!/bench/i.test(new URL(databaseUrl).pathname)) {
  throw new Error(`Refusing to run: DATABASE_URL must point at a database with "bench" in its name (got ${databaseUrl}).`);
}

// --------------------------------------------------------------------------------------------- measuring

const CLOCK_TICKS = 100; // getconf CLK_TCK on Linux

function postgresCpuSeconds(): number {
  let ticks = 0;
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const cmdline = readFileSync(`/proc/${entry}/cmdline`, "utf8");
      if (!cmdline.startsWith("postgres")) continue;
      const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      ticks += Number(fields[11]) + Number(fields[12]); // utime + stime
    } catch {
      // the process ended while we looked
    }
  }
  return ticks / CLOCK_TICKS;
}

type Measure = {
  wallMs: number;
  nodeCpuMs: number;
  postgresCpuMs: number;
  eventLoopBusy: number;
  peakRssMb: number;
  statements: number;
  rows: number;
  dbExecMs: number;
  top: { query: string; calls: number; ms: number; rows: number }[];
};

type Stat = { query: string; calls: number; ms: number; rows: number };

/** pg_stat_statements is cumulative and needs no privilege to read; a run's cost is the difference of two snapshots. */
async function snapshotStatements(): Promise<Map<string, Stat>> {
  const result = await db.execute<{ queryid: string; query: string; calls: string; ms: string; rows: string }>(sql`
    select queryid::text, regexp_replace(query, '[[:space:]]+', ' ', 'g') as query, calls::text, total_exec_time::text as ms, rows::text
    from pg_stat_statements
    where dbid = (select oid from pg_database where datname = current_database())
      and query not like '%pg_stat_statements%'
  `);
  return new Map(result.rows.map((r) => [r.queryid, { query: r.query, calls: Number(r.calls), ms: Number(r.ms), rows: Number(r.rows) }]));
}

function diffStatements(before: Map<string, Stat>, after: Map<string, Stat>) {
  const changed: Stat[] = [];
  for (const [id, stat] of after) {
    const prev = before.get(id);
    const delta = { query: stat.query, calls: stat.calls - (prev?.calls ?? 0), ms: stat.ms - (prev?.ms ?? 0), rows: stat.rows - (prev?.rows ?? 0) };
    if (delta.calls > 0) changed.push(delta);
  }
  changed.sort((a, b) => b.ms - a.ms);
  return {
    statements: changed.reduce((sum, c) => sum + c.calls, 0),
    rows: changed.reduce((sum, c) => sum + c.rows, 0),
    dbExecMs: changed.reduce((sum, c) => sum + c.ms, 0),
    top: changed.slice(0, 12).map((c) => ({ query: c.query.slice(0, 130), calls: c.calls, ms: Math.round(c.ms * 10) / 10, rows: c.rows })),
  };
}

async function measure(label: string, work: () => Promise<unknown>): Promise<Measure> {
  const statements0 = await snapshotStatements();
  const cpu0 = process.cpuUsage();
  const elu0 = performance.eventLoopUtilization();
  const pg0 = postgresCpuSeconds();
  let peak = process.memoryUsage().rss;
  const sampler = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 25);
  const t0 = performance.now();
  await work();
  const wallMs = performance.now() - t0;
  clearInterval(sampler);
  const cpu = process.cpuUsage(cpu0);
  const elu = performance.eventLoopUtilization(elu0);
  const pg = postgresCpuSeconds() - pg0;
  const statements = diffStatements(statements0, await snapshotStatements());
  const result: Measure = {
    wallMs: Math.round(wallMs),
    nodeCpuMs: Math.round((cpu.user + cpu.system) / 1000),
    postgresCpuMs: Math.round(pg * 1000),
    eventLoopBusy: Number(elu.utilization.toFixed(3)),
    peakRssMb: Math.round(peak / 1_048_576),
    ...statements,
  };
  console.error(
    `  ${label.padEnd(26)} wall ${String(result.wallMs).padStart(7)} ms | node CPU ${String(result.nodeCpuMs).padStart(7)} ms | ` +
      `postgres CPU ${String(result.postgresCpuMs).padStart(7)} ms | statements ${String(result.statements).padStart(7)} | rows ${String(result.rows).padStart(8)} | ` +
      `loop busy ${(result.eventLoopBusy * 100).toFixed(0).padStart(3)}% | peak RSS ${result.peakRssMb} MB`,
  );
  if (args.top) {
    for (const row of result.top.slice(0, Number(args.top))) {
      console.error(`      ${String(row.calls).padStart(6)} calls ${String(row.ms).padStart(9)} ms ${String(row.rows).padStart(8)} rows  ${row.query.slice(0, 100)}`);
    }
  }
  return result;
}

// --------------------------------------------------------------------------------------------- seeding

const keepArticles = args["keep-articles"] === "true";

async function reset() {
  if (keepArticles) {
    // Keep the production-sized articles table seeded by bench/seed-articles.ts; only the tenant side starts over.
    await db.execute(sql`
      truncate table mentions, alert_events, alert_rules, notifications, email_outbox, monitoring_queries, projects, workspaces,
        organizations restart identity cascade
    `);
    await db.execute(sql`update sources set last_checked_at = null`);
    return;
  }
  await db.execute(sql`
    truncate table mentions, articles, alert_events, alert_rules, notifications, email_outbox, monitoring_queries, projects,
      workspaces, organizations, sources restart identity cascade
  `);
}

async function seedMonitorings(count: number): Promise<{ organizationId: string; projectId: string; queryId: string }[]> {
  const vocabulary = makeVocabulary();
  const organizations = Math.max(1, Math.round(count / 5));
  const made: { organizationId: string; projectId: string; queryId: string }[] = [];
  for (let o = 0; o < organizations; o += 1) {
    const [org] = await db.insert(schema.organizations).values({ name: `Bench Org ${o}`, slug: `bench-org-${o}` }).returning();
    const organizationId = asOrganizationId(org!.id);
    const [workspace] = await db.insert(schema.workspaces).values({ organizationId, name: "Default" }).returning();
    const project = await createProject(db, organizationId, { workspaceId: workspace!.id, name: "Bench" });
    for (let q = o; q < count; q += organizations) {
      const ast = {
        include: [brandToken(q), ...(q % 3 === 0 ? [vocabulary[200 + q]!] : [])],
        exclude: q % 4 === 0 ? [vocabulary[5]!] : [],
        exactPhrases: q % 5 === 0 ? [`${vocabulary[300 + q]} ${vocabulary[301 + q]}`] : [],
      };
      const query = await createMonitoringQuery(db, organizationId, {
        projectId: project.id,
        name: `Bench monitoring ${q}`,
        queryAst: ast,
        booleanQuery: astToBooleanQuery(ast),
        sourceTypes: ["news", "press", "newspaper", "magazine", "blog", "website"],
        trackingTarget: q % 10 === 0 ? "competitor" : "company",
      });
      made.push({ organizationId, projectId: project.id, queryId: query.id });
    }
  }
  return made;
}

async function seedSources(count: number) {
  const have = new Set((await db.select({ domain: schema.sources.domain }).from(schema.sources)).map((row) => row.domain));
  for (let from = 0; from < count; from += 500) {
    const rows = [];
    for (let i = from; i < Math.min(count, from + 500); i += 1) {
      if (have.has(hostOf(i))) continue;
      rows.push({
        name: `Bench Publisher ${i}`,
        domain: hostOf(i),
        url: feedUrl(i),
        type: "news",
        connector: "rss",
        language: "tr",
        country: "TR",
        status: "healthy",
        canDisplayExcerpt: true,
      });
    }
    if (rows.length > 0) await db.insert(schema.sources).values(rows);
  }
}

async function seedAlertRules(queries: { organizationId: string; projectId: string; queryId: string }[]) {
  const rows = queries.flatMap((q, index) => {
    const base = { organizationId: q.organizationId, projectId: q.projectId, queryId: q.queryId, channels: ["in_app"], cooldownMinutes: 60 };
    return [
      ...(index % 2 === 0 ? [{ ...base, name: `keyword ${index}`, type: "keyword" }] : []),
      ...(index % 4 === 0 ? [{ ...base, name: `important ${index}`, type: "high_relevance" }] : []),
      { ...base, name: `spike ${index}`, type: "spike" },
      { ...base, name: `sentiment ${index}`, type: "sentiment_shift" },
      { ...base, name: `topic ${index}`, type: "emerging_topic" },
      ...(index % 10 === 0 ? [{ ...base, name: `competitor ${index}`, type: "competitor" }] : []),
      ...(index % 3 === 0 ? [{ ...base, name: `creator ${index}`, type: "creator_spike" }] : []),
    ];
  });
  for (let from = 0; from < rows.length; from += 500) await db.insert(schema.alertRules).values(rows.slice(from, from + 500));
  return rows.length;
}

/** Thirty days of stored stories and mentions, as a database that has been running for a while holds. */
async function seedHistory(articlesToAdd: number, queries: { organizationId: string; projectId: string; queryId: string }[]) {
  if (!keepArticles) await db.execute(sql`
    insert into articles (source_id, canonical_url, content_hash, title, stored_excerpt, language, published_at, fetched_at, created_at, search_vector)
    select (select id from sources order by id limit 1),
           'https://history.bench.example/' || g,
           md5('history' || g),
           'Geçmiş haber ' || g || ' yeni ekonomi bank yatırım',
           'Kısa özet ' || g,
           'tr',
           now() - ((g % 720) || ' hours')::interval,
           now() - ((g % 720) || ' hours')::interval,
           now() - ((g % 720) || ' hours')::interval,
           to_tsvector('simple', 'geçmiş haber ' || g || ' yeni ekonomi bank yatırım')
    from generate_series(1, ${articlesToAdd}) g
  `);
  // Each story is a mention of ~1.5 monitorings: enough rows per monitoring to make the alert queries do real work.
  const ids = sql.join(queries.map((q) => sql`(${q.organizationId}::uuid, ${q.projectId}::uuid, ${q.queryId}::uuid)`), sql`, `);
  await db.execute(sql`
    with qs as (
      select row_number() over () - 1 as n, o, p, q from (values ${ids}) as t(o, p, q)
    ), total as (select count(*) as c from qs),
    arts as (select id, row_number() over (order by id) as rn, created_at from articles where canonical_url like ${keepArticles ? "https://bench.example/%" : "https://history.bench.example/%"})
    insert into mentions (organization_id, project_id, query_id, article_id, matched_terms, priority, status, created_at)
    select qs.o, qs.p, qs.q, arts.id, array['bench'], 'normal', 'new', arts.created_at
    from arts join qs on qs.n = (arts.rn % (select c from total))
    on conflict do nothing
  `);
  await db.execute(sql`analyze mentions`);
  await db.execute(sql`analyze articles`);
}

// --------------------------------------------------------------------------------------------- fake internet

type FetchOptions = { headers?: Record<string, string>; timeoutMs?: number; method?: string };
let currentCycle = 0;
const served = { requests: 0, bodies: 0, notModified: 0, bytes: 0 };

/** What the RSS connector reaches the internet with in the benchmark: the fake publishers, no network. */
function fakeFetcher() {
  return async (url: string, options: FetchOptions = {}) => {
    const parsed = new URL(url);
    served.requests += 1;
    if (parsed.pathname === "/robots.txt") return { status: 404, headers: new Headers(), body: "", finalUrl: url };
    const index = Number(parsed.hostname.match(/^feed(\d+)\./)?.[1]);
    const feed = renderFeed(index, currentCycle, scale);
    const headers = new Headers();
    if (feed.etag) headers.set("etag", feed.etag);
    if (feed.lastModified) headers.set("last-modified", feed.lastModified);
    const given = Object.fromEntries(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    if ((feed.etag && given["if-none-match"] === feed.etag) || (!feed.etag && feed.lastModified && given["if-modified-since"] === feed.lastModified)) {
      served.notModified += 1;
      return { status: 304, headers, body: "", finalUrl: url };
    }
    served.bodies += 1;
    served.bytes += feed.body.length;
    return { status: 200, headers, body: feed.body, finalUrl: url };
  };
}

// --------------------------------------------------------------------------------------------- scenarios

const emailQueue = { add: async () => ({}) } as never;
const silent = () => {
  const original = console.log;
  console.log = () => {};
  return () => {
    console.log = original;
  };
};

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<unknown>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length > 0) await work(queue.shift()!);
    }),
  );
}

async function crawlScenario() {
  console.error(`\n== crawl: ${scale.sources} sources x ${scale.itemsPerFeed} stories, ${scale.monitorings} monitorings, ${cycles} cycles (${impl})`);
  await reset();
  const queries = await seedMonitorings(scale.monitorings);
  await seedAlertRules(queries.slice(0, Math.floor(queries.length / 2)));
  await seedSources(scale.sources);
  const wanted = new Set(Array.from({ length: scale.sources }, (_, i) => hostOf(i)));
  const sourceIds = (await db.select({ id: schema.sources.id, domain: schema.sources.domain }).from(schema.sources))
    .filter((row) => wanted.has(row.domain))
    .map((row) => row.id);

  const results: (Measure & { cycle: number; requests: number; fullBodies: number; notModified: number; bytesMb: number })[] = [];
  const crawl = await crawlRunner();
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    currentCycle = cycle;
    await crawl.beforeCycle();
    Object.assign(served, { requests: 0, bodies: 0, notModified: 0, bytes: 0 });
    const restore = silent();
    const result = await measure(`cycle ${cycle}${cycle === 0 ? " (first visit)" : ""}`, () => pool(sourceIds, concurrency, (id) => crawl.one(id)));
    restore();
    results.push({
      cycle,
      ...result,
      requests: served.requests,
      fullBodies: served.bodies,
      notModified: served.notModified,
      bytesMb: Number((served.bytes / 1_048_576).toFixed(1)),
    });
    console.error(`    fetches ${served.requests} (full bodies ${served.bodies}, not modified ${served.notModified}, ${(served.bytes / 1_048_576).toFixed(1)} MB)`);
  }
  const [counts] = (await db.execute<{ articles: string; mentions: string }>(sql`select (select count(*) from articles)::text as articles, (select count(*) from mentions)::text as mentions`)).rows;
  console.error(`  stored: ${counts!.articles} articles, ${counts!.mentions} mentions`);
  return { results, stored: { articles: Number(counts!.articles), mentions: Number(counts!.mentions) } };
}

async function crawlRunner(): Promise<{ beforeCycle: () => Promise<void>; one: (id: string) => Promise<unknown> }> {
  if (impl === "baseline") {
    const { processCrawlSourceJob } = await import("../src/jobs/crawl-source");
    const { RSSConnector } = await import("@cim/ingestion");
    const connector = new RSSConnector({ fetcher: fakeFetcher() as never, robotsBlocked: async () => false });
    const connectorFor = () => connector;
    return {
      // The old scheduler decides by last_checked_at: make every source due, as it is two hours on.
      beforeCycle: async () => {
        await db.update(schema.sources).set({ lastCheckedAt: new Date(Date.now() - 3 * 3_600_000) });
      },
      one: (id) => processCrawlSourceJob({ data: { sourceId: id }, attemptsMade: 0 } as never, emailQueue, { connectorFor }),
    };
  }
  const { createBenchCrawlRunner } = await import("./v2-adapter");
  return createBenchCrawlRunner({ emailQueue, scale, getCycle: () => currentCycle, served });
}

async function schedulerScenario() {
  const total = num("scheduler-sources", 9000);
  console.error(`\n== scheduler tick with ${total} sources (${impl})`);
  await reset();
  await seedSources(total);
  const results: Record<string, Measure> = {};
  const runner = await schedulerRunner();
  // Nothing is due: the cost of looking.
  await runner.prepare(0);
  results["tick, nothing due"] = await measure("tick, nothing due (x10)", async () => {
    for (let i = 0; i < 10; i += 1) await runner.tick();
  });
  // 5% due, as in a steady state.
  await runner.prepare(0.05);
  results["tick, 5% due"] = await measure("tick, 5% due (x1)", () => runner.tick());
  return results;
}

async function schedulerRunner(): Promise<{ prepare: (dueShare: number) => Promise<void>; tick: () => Promise<unknown> }> {
  const queue = { getJob: async () => undefined, add: async () => ({}), getWaitingCount: async () => 0 } as never;
  if (impl === "baseline") {
    const { processCrawlSchedulerJob } = await import("../src/jobs/crawl-scheduler");
    return {
      prepare: async (dueShare) => {
        await db.execute(sql`update sources set last_checked_at = case when random() < ${dueShare} then now() - interval '3 hours' else now() end`);
      },
      tick: () => processCrawlSchedulerJob(queue),
    };
  }
  const { createBenchSchedulerRunner } = await import("./v2-adapter");
  return createBenchSchedulerRunner(queue);
}

async function alertsScenario() {
  const history = num("history", 300_000);
  console.error(`\n== alert evaluators with ${scale.monitorings} monitorings and ${history} stored stories (${impl})`);
  await reset();
  const queries = await seedMonitorings(scale.monitorings);
  await seedSources(1);
  const rules = await seedAlertRules(queries);
  console.error(`  ${rules} alert rules`);
  await seedHistory(history, queries);
  const evaluators = await alertEvaluators();
  const results: Record<string, Measure> = {};
  for (const [name, run] of Object.entries(evaluators)) {
    results[name] = await measure(name, run);
  }
  return results;
}

async function alertEvaluators(): Promise<Record<string, () => Promise<unknown>>> {
  if (impl === "baseline") {
    const [{ evaluateSpikeAlerts }, { evaluateSentimentShiftAlerts }, { evaluateEmergingTopicAlerts }, { evaluateCompetitorAlerts }, { evaluateCreatorSpikeAlerts }] =
      await Promise.all([
        import("../src/alerts/evaluate-spikes"),
        import("../src/alerts/evaluate-sentiment-shift"),
        import("../src/alerts/evaluate-emerging-topics"),
        import("../src/alerts/evaluate-competitor"),
        import("../src/alerts/evaluate-creator-spike"),
      ]);
    return {
      "spike (one minute)": () => evaluateSpikeAlerts(emailQueue),
      "sentiment shift (one minute)": () => evaluateSentimentShiftAlerts(emailQueue),
      "emerging topic (one minute)": () => evaluateEmergingTopicAlerts(emailQueue),
      "competitor (one minute)": () => evaluateCompetitorAlerts(emailQueue),
      "creator spike (one minute)": () => evaluateCreatorSpikeAlerts(emailQueue),
    };
  }
  const { createBenchAlertRunners } = await import("./v2-adapter");
  return createBenchAlertRunners(emailQueue);
}

// --------------------------------------------------------------------------------------------- main

const output: Record<string, unknown> = {
  impl,
  at: new Date().toISOString(),
  node: process.version,
  cpus: (await import("node:os")).cpus().length,
  scale,
  cycles,
  concurrency,
};
const restore = silent();
restore();
if (scenario === "crawl" || scenario === "all") output.crawl = await crawlScenario();
if (scenario === "scheduler" || scenario === "all") output.scheduler = await schedulerScenario();
if (scenario === "alerts" || scenario === "all") output.alerts = await alertsScenario();

if (args.out) writeFileSync(args.out, JSON.stringify(output, null, 2));
console.error("\ndone");
process.exit(0);
