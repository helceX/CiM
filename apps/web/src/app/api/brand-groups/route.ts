import { NextResponse } from "next/server";
import { createBrandGroupSchema } from "@cim/validation";
import { createBrandGroup, db, getProject, listBrandGroups, recordAuditLog } from "@cim/db";
import { authorize } from "./auth";

export async function GET(request: Request) {
  const auth = await authorize("monitoring:read");
  if (auth.response) return auth.response;

  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const groups = await listBrandGroups(db, auth.context.organizationId, projectId);
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const auth = await authorize("monitoring:write");
  if (auth.response) return auth.response;
  const { context } = auth;

  const parsed = createBrandGroupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  // Never trust a client-supplied projectId (ADR-001).
  const project = await getProject(db, context.organizationId, parsed.data.projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const result = await createBrandGroup(db, context.organizationId, {
    projectId: project.id,
    name: parsed.data.name,
    kind: parsed.data.kind,
    color: parsed.data.color,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "A group with that name already exists in this project" }, { status: 409 });
  }

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "brand_group.created",
    targetType: "brand_group",
    targetId: result.group.id,
    metadata: { name: result.group.name, kind: result.group.kind },
  });
  return NextResponse.json({ ok: true, groupId: result.group.id });
}
