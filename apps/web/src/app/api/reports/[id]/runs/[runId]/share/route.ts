import { NextResponse } from "next/server";
import { createReportShareLinkSchema } from "@cim/validation";
import { getEnv } from "@cim/config";
import { generateRawToken, hashToken } from "@cim/core";
import {
  createReportShareLink,
  db,
  getReport,
  getReportRun,
  recordAuditLog,
  revokeReportShareLinks,
  type OrganizationId,
} from "@cim/db";
import { requirePermission } from "@/lib/tenant";

async function loadOwnedRun(
  organizationId: OrganizationId,
  reportId: string,
  runId: string,
) {
  const [report, run] = await Promise.all([
    getReport(db, organizationId, reportId),
    getReportRun(db, organizationId, runId),
  ]);
  if (!report || !run || run.reportId !== report.id) return null;
  return { report, run };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  let context;
  try {
    context = await requirePermission("reports:write");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "You don't have permission to share this report" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id, runId } = await params;
  const found = await loadOwnedRun(context.organizationId, id, runId);
  if (!found) {
    return NextResponse.json({ error: "Report run not found" }, { status: 404 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = createReportShareLinkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const rawToken = generateRawToken();
  const expiresAt = new Date(
    Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000,
  );

  const result = await createReportShareLink(db, context.organizationId, runId, {
    tokenHash: hashToken(rawToken),
    expiresAt,
    createdByUserId: context.userId,
  });
  if (result === "run_not_completed") {
    return NextResponse.json(
      { error: "This report run isn't completed yet" },
      { status: 409 },
    );
  }
  if (result === "not_found") {
    return NextResponse.json({ error: "Report run not found" }, { status: 404 });
  }

  // The raw token is returned exactly once, here — only its hash is ever
  // stored (packages/db/src/schema/reports.ts's reportShareLinks
  // comment), so this response is the only place it will ever appear.
  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "report.share_link_created",
    targetType: "report_run",
    targetId: runId,
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  return NextResponse.json({
    url: `${getEnv().APP_URL}/api/shared-reports/${rawToken}`,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  let context;
  try {
    context = await requirePermission("reports:write");
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "You don't have permission to revoke this report's share link" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id, runId } = await params;
  const found = await loadOwnedRun(context.organizationId, id, runId);
  if (!found) {
    return NextResponse.json({ error: "Report run not found" }, { status: 404 });
  }

  await revokeReportShareLinks(db, context.organizationId, runId);

  await recordAuditLog(db, context.organizationId, {
    actorUserId: context.userId,
    action: "report.share_link_revoked",
    targetType: "report_run",
    targetId: runId,
  });

  return NextResponse.json({ ok: true });
}
