import { NextResponse } from "next/server";
import { db, getReport, getReportFile, getReportRun } from "@cim/db";
import { requireOrgContext } from "@/lib/tenant";

const EXTENSION: Record<"pdf" | "csv" | "xlsx", string> = {
  pdf: "pdf",
  csv: "csv",
  xlsx: "xlsx",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  let context;
  try {
    context = await requireOrgContext();
  } catch {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id, runId } = await params;
  const format = new URL(request.url).searchParams.get("format");
  if (format !== "pdf" && format !== "csv" && format !== "xlsx") {
    return NextResponse.json(
      { error: "format must be pdf, csv, or xlsx" },
      { status: 400 },
    );
  }

  // Ownership is checked on both the Report and the Run — never trust a
  // run id alone without confirming it belongs to this org's report too.
  const [report, run] = await Promise.all([
    getReport(db, context.organizationId, id),
    getReportRun(db, context.organizationId, runId),
  ]);
  if (!report || !run || run.reportId !== report.id) {
    return NextResponse.json({ error: "Report run not found" }, { status: 404 });
  }
  if (run.status !== "completed") {
    return NextResponse.json(
      { error: `Report run is ${run.status}, not completed` },
      { status: 409 },
    );
  }

  const file = await getReportFile(db, runId, format);
  if (!file) {
    return NextResponse.json({ error: "Report file not found" }, { status: 404 });
  }

  const filename = `${report.name.replace(/[^a-z0-9-_]+/gi, "-")}.${EXTENSION[format]}`;
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(file.sizeBytes),
    },
  });
}
