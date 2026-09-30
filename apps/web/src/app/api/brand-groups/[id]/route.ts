import { NextResponse } from "next/server";
import { updateBrandGroupSchema } from "@cim/validation";
import { db, deleteBrandGroup, recordAuditLog, updateBrandGroup } from "@cim/db";
import { authorize } from "../auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize("monitoring:write");
  if (auth.response) return auth.response;
  const { context } = auth;

  const { id } = await params;
  const parsed = updateBrandGroupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await updateBrandGroup(db, context.organizationId, id, parsed.data);
  if (!result.ok) {
    return result.reason === "name_taken"
      ? NextResponse.json({ error: "A group with that name already exists in this project" }, { status: 409 })
      : NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "brand_group.updated",
    targetType: "brand_group",
    targetId: id,
    metadata: parsed.data,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize("monitoring:write");
  if (auth.response) return auth.response;
  const { context } = auth;

  const { id } = await params;
  const deleted = await deleteBrandGroup(db, context.organizationId, id);
  if (!deleted) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "brand_group.deleted",
    targetType: "brand_group",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
