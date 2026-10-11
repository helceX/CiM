import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import {
  checkSourcePolicy, createSource, createMonitoringQueryWithPlanLimit, createAlertRule,
  db, listProjects, listMonitoringQueries, listAlertRules, recordAuditLog, schema, type Db,
} from "@cim/db";
import { astToBooleanQuery, type QueryAst } from "@cim/core";
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
  const { brand, handle, example } = parsed.data;
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
    const ast: QueryAst = { include: [...(handle ? [`@${handle}`] : []), brand], exclude: [], exactPhrases: [], company: { name: brand } };
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
      let query = queries.find((q) => q.name === name && q.booleanQuery === booleanQuery && q.sourceTypes.length === 1 && q.sourceTypes[0] === "social");
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
      if (!rule) {
        const created = await createAlertRule(store, context.organizationId, { projectId: query.projectId, queryId: query.id, createdByUserId: context.userId, name: `${name} · yeni içerik`, type: "keyword", channels: ["in_app"], cooldownMinutes: 60 });
        rule = { rule: created, queryName: query.name };
      }
      await recordAuditLog(store, context.organizationId, { actorUserId: context.userId, action: "social_monitoring.setup", targetType: "monitoring_query", targetId: query.id });
      return { queryId: query.id, alertRuleId: rule.rule.id, sourceIds: ids, active: query.status === "active" && rule.rule.status === "active" };
    });
    return NextResponse.json({ ok: true, ...result, sampleCount: samples.reduce((n, s) => n + s.length, 0) });
  } catch (error) {
    console.error("[social] setup failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: error instanceof SetupError ? error.message : "Kurulum tamamlanamadı. Kaynak geçici olarak yanıt vermiyor olabilir; daha sonra tekrar deneyin." }, { status: 422 });
  }
}
