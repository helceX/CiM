import { NextResponse } from "next/server";
import { z } from "zod";
import { db, getMonitoringQuery, setMonitoringQueryStatus, recordAuditLog } from "@cim/db";
import { requirePermission } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let context;
  try { context = await requirePermission("monitoring:write"); }
  catch { return NextResponse.json({ error: "İzlemeyi değiştirme yetkiniz yok." }, { status: 403 }); }
  const { id } = await params;
  const input = z.object({ status: z.enum(["active", "paused"]) }).safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !input.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  const limited = await checkRateLimit(`social-state:${context.organizationId}:${context.userId}`, { limit: 30, windowSeconds: 3600 });
  if (!limited.allowed) return NextResponse.json({ error: "İşlem sınırına ulaşıldı." }, { status: 429 });
  const query = await getMonitoringQuery(db, context.organizationId, id);
  if (!query || query.sourceTypes.length !== 1 || query.sourceTypes[0] !== "social") return NextResponse.json({ error: "Sosyal izleme bulunamadı." }, { status: 404 });
  const changed = await setMonitoringQueryStatus(db, context.organizationId, id, input.data.status);
  if (!changed) return NextResponse.json({ error: "Sosyal izleme bulunamadı." }, { status: 404 });
  await recordAuditLog(db, context.organizationId, { actorUserId: context.userId, action: `social_monitoring.${input.data.status}`, targetType: "monitoring_query", targetId: id });
  return NextResponse.json({ ok: true, status: input.data.status });
}
