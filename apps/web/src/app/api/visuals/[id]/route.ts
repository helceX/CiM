import { NextResponse } from "next/server";
import { updateVisualSchema } from "@cim/validation";
import { db, deleteSavedVisual, getProject, recordAuditLog, updateSavedVisual } from "@cim/db";
import { authorize } from "../auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize("monitoring:write");
  if (auth.response) return auth.response;
  const { context } = auth;

  const { id } = await params;
  const parsed = updateVisualSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const projectId = parsed.data.spec?.filters.projectId;
  if (projectId && !(await getProject(db, context.organizationId, projectId))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const visual = await updateSavedVisual(db, context.organizationId, id, parsed.data);
  if (!visual) return NextResponse.json({ error: "Visual not found" }, { status: 404 });

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "visual.updated",
    targetType: "saved_visual",
    targetId: id,
    metadata: { name: visual.name },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize("monitoring:write");
  if (auth.response) return auth.response;
  const { context } = auth;

  const { id } = await params;
  if (!(await deleteSavedVisual(db, context.organizationId, id))) {
    return NextResponse.json({ error: "Visual not found" }, { status: 404 });
  }
  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "visual.deleted",
    targetType: "saved_visual",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
