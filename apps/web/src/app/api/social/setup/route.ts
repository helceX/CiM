import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import {
  checkSourcePolicy, createSource, createMonitoringQueryWithPlanLimit, createAlertRule,
  db, listProjects, listMonitoringQueries, listAlertRules, getMonitoringQuery, updateMonitoringQuery, recordAuditLog, schema, type Db,
} from "@cim/db";
import { astToBooleanQuery, matchableText, matchesText, type QueryAst } from "@cim/core";
import { BlueskySearchConnector, blueskySearchUrl, safeFetch } from "@cim/ingestion";
import { requirePermission } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";

class SetupError extends Error {}

const inputSchema = z.object({
  brand: z.string().trim().min(2).max(80),
  handle: z.string().trim().max(100).default("").transform((s) => s.replace(/^@/, "").toLowerCase())
    .refine((s) => !s || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(s), "Bluesky hesabını bsky.app biçiminde yazın."),
  example: z.boolean().default(false),
  excluded: z.array(z.string().trim().min(2).max(60)).max(10).default([]),
  queryId: z.uuid().optional(),
});

/** Fixed public search sources are shared; customer queries and alerts stay tenant-scoped. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
  let context;
  try { context = await requirePermission("monitoring:write"); }
  catch { return NextResponse.json({ error: "Bu kuruluşta izleme oluşturma yetkiniz yok." }, { status: 403 }); }
  if (!context.permissions.includes("alerts:write")) return NextResponse.json({ error: "Bildirim kuralı oluşturma yetkiniz yok." }, { status: 403 });
  const limited = await checkRateLimit(`social-setup:${context.organizationId}:${context.userId}`, { limit: 10, windowSeconds: 3600 });
  if (!limited.allowed) return NextResponse.json({ error: "Kurulum sınırına ulaşıldı. Daha sonra tekrar deneyin." }, { status: 429 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Geçersiz giriş." }, { status: 400 });
  const { brand, handle, example, excluded, queryId } = parsed.data;
  const editing = queryId ? await getMonitoringQuery(db, context.organizationId, queryId) : undefined;
  if (queryId && (!editing || editing.sourceTypes.length !== 1 || editing.sourceTypes[0] !== "social")) {
    return NextResponse.json({ error: "Sosyal izleme bulunamadı." }, { status: 404 });
  }
  const [project] = await listProjects(db, context.organizationId);
  if (!project) return NextResponse.json({ error: "Önce bir çalışma alanı oluşturun." }, { status: 409 });

  try {
    const brandUrl = blueskySearchUrl(brand);
    const policy = await checkSourcePolicy(db, brandUrl);
    if (policy) return NextResponse.json({ error: "Bu kaynak için toplama izni yok." }, { status: 409 });
    let tagged: { did: string; handle: string } | undefined;
    if (handle) {
      const address = new URL("https://api.bsky.app/xrpc/app.bsky.actor.getProfile");
      address.searchParams.set("actor", handle);
      const profile = await safeFetch(address.href, { timeoutMs: 8000, maxResponseBytes: 256 * 1024, maxRedirects: 0 });
      if (profile.status !== 200) return NextResponse.json({ error: "Bluesky hesabı doğrulanamadı. Hesap adresini kontrol edin." }, { status: 422 });
      const data = JSON.parse(profile.body) as { did?: string; handle?: string };
      if (!data.did || data.handle?.toLowerCase() !== handle) return NextResponse.json({ error: "Bluesky hesap kimliği doğrulanamadı." }, { status: 422 });
      tagged = { did: data.did, handle };
    }
    const addresses = [brandUrl, ...(tagged ? [blueskySearchUrl(brand, tagged)] : [])];
    // A valid search with zero results is still a usable monitoring, never filled with fake posts.
    const reader = new BlueskySearchConnector();
    const samples = [];
    for (const address of addresses) samples.push(await reader.read(address));
    const ast: QueryAst = { include: [...(handle ? [`@${handle}`] : []), brand], exclude: [...new Set(excluded)], exactPhrases: [], company: { name: brand } };
    const booleanQuery = astToBooleanQuery(ast);
    const name = `${example ? "Çalışma örneği" : "Sosyal takip"} — ${brand}`;

    const result = await db.transaction(async (tx) => {
      const store = tx as unknown as Db;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('social:setup'))`);
      const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(schema.sources).where(eq(schema.sources.connector, "bluesky-search"));
      const currentSources = await tx.select().from(schema.sources).where(eq(schema.sources.connector, "bluesky-search"));
      const needed = addresses.filter((url) => !currentSources.some((source) => source.url === url));
      if (Number(count?.total ?? 0) + needed.length > 40) throw new SetupError("Maliyeti sınırlamak için en fazla 40 Bluesky arama kaynağı kurulabilir.");
      const queries = await listMonitoringQueries(store, context.organizationId);
      let query = editing ? queries.find((q) => q.id === editing.id) : queries.find((q) => q.name === name && q.booleanQuery === booleanQuery && q.sourceTypes.length === 1 && q.sourceTypes[0] === "social");
      if (editing) {
        if (!query) throw new SetupError("Sosyal izleme bulunamadı.");
        query = await updateMonitoringQuery(store, context.organizationId, query.id, { name: editing.name.startsWith("Çalışma örneği") ? `Çalışma örneği — ${brand}` : name, queryAst: ast, booleanQuery, sourceTypes: ["social"], regionScopes: [], trackingTarget: "company" });
        if (!query) throw new SetupError("Sosyal izleme bulunamadı.");
      }
      if (!query) {
        if (queries.filter((q) => q.sourceTypes.length === 1 && q.sourceTypes[0] === "social").length >= 3) throw new SetupError("Kuruluş başına en fazla 3 sosyal izleme kurulabilir.");
        const created = await createMonitoringQueryWithPlanLimit(store, context.organizationId, {
          projectId: project.id, name, queryAst: ast, booleanQuery, sourceTypes: ["social"], regionScopes: [], trackingTarget: "company",
        }, { unlimited: user.isPlatformSuperAdmin === true });
        if (!created.ok) throw new SetupError("Planınızın izleme sınırına ulaşıldı.");
        query = created.query;
      }
      const ids: string[] = [];
      for (const [index, address] of addresses.entries()) {
        const existing = currentSources.find((source) => source.url === address);
        if (existing) {
          if (existing.status === "unavailable") throw new SetupError("Bu kaynak durdurulmuş. Destek ekibinden kaynağın incelenmesini isteyin.");
          ids.push(existing.id);
          continue;
        }
        const source = await createSource(store, { name: `Bluesky — ${index === 0 ? brand : `@${handle} etiketleri`}`, url: address, connector: "bluesky-search", type: "social", language: "other", country: "ZZ" });
        if (!source.ok) throw new SetupError("Kaynak kaydedilemedi.");
        // No paid AI enrichment for these public search sources.
        await tx.update(schema.sources).set({ canProcessAi: false }).where(eq(schema.sources.id, source.id));
        ids.push(source.id);
      }
      const rules = await listAlertRules(store, context.organizationId);
      let rule = rules.find(({ rule }) => rule.queryId === query!.id && rule.type === "keyword" && rule.channels.includes("in_app"));
      if (rule && editing && rule.rule.name === `${editing.name} · yeni içerik`) {
        await tx.update(schema.alertRules).set({ name: `${query.name} · yeni içerik`, updatedAt: new Date() }).where(eq(schema.alertRules.id, rule.rule.id));
      }
      if (!rule) {
        const created = await createAlertRule(store, context.organizationId, { projectId: query.projectId, queryId: query.id, createdByUserId: context.userId, name: `${name} · yeni içerik`, type: "keyword", channels: ["in_app"], cooldownMinutes: 60 });
        rule = { rule: created, queryName: query.name };
      }
      await recordAuditLog(store, context.organizationId, { actorUserId: context.userId, action: editing ? "social_monitoring.updated" : "social_monitoring.setup", targetType: "monitoring_query", targetId: query.id });
      return { queryId: query.id, alertRuleId: rule.rule.id, sourceIds: ids, active: query.status === "active" && rule.rule.status === "active" };
    });
    const matchingSamples = samples.flat().filter((post) => matchesText(ast, matchableText({ title: post.title, lead: post.bodyText, sourceType: "social", socialMentionHandles: post.socialMentionHandles }), { language: post.language }));
    return NextResponse.json({ ok: true, ...result, sampleCount: new Set(matchingSamples.map((post) => post.canonicalUrl)).size });
  } catch (error) {
    console.error("[social] setup failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: error instanceof SetupError ? error.message : "Kurulum tamamlanamadı. Kaynak geçici olarak yanıt vermiyor olabilir; daha sonra tekrar deneyin." }, { status: 422 });
  }
}
