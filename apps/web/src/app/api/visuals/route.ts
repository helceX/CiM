import { NextResponse } from "next/server";
import { createVisualSchema } from "@cim/validation";
import { createSavedVisual, db, getProject, listSavedVisuals, recordAuditLog } from "@cim/db";
import { authorize } from "./auth";

export async function GET() {
  const auth = await authorize("monitoring:read");
  if (auth.response) return auth.response;
  const visuals = await listSavedVisuals(db, auth.context.organizationId);
  return NextResponse.json({ visuals });
}

export async function POST(request: Request) {
  const auth = await authorize("monitoring:write");
  if (auth.response) return auth.response;
  const { context } = auth;

  const parsed = createVisualSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  // Never trust a client-supplied projectId (ADR-001).
  const projectId = parsed.data.spec.filters.projectId;
  if (projectId && !(await getProject(db, context.organizationId, projectId))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const visual = await createSavedVisual(db, context.organizationId, {
    ...parsed.data,
    createdBy: context.userId,
  });
  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "visual.created",
    targetType: "saved_visual",
    targetId: visual.id,
    metadata: { name: visual.name, kind: visual.kind },
  });
  return NextResponse.json({ ok: true, visualId: visual.id });
}
