import { notFound } from "next/navigation";
import { Badge } from "@cim/ui";
import { db, getActiveReportShareLink, getReport, listReportRuns } from "@cim/db";
import { getReportTemplate } from "@cim/reports/templates";
import { requireOrgContext } from "@/lib/tenant";
import { RunAgainButton } from "./run-again-button";
import { ScheduleSection } from "./schedule-section";
import { ShareLinkControl } from "./share-link-control";

const STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  queued: "neutral",
  running: "warning",
  completed: "success",
  failed: "danger",
};

const PERIOD_LABEL: Record<string, string> = {
  rolling_7d: "Last 7 days",
  rolling_30d: "Last 30 days",
};

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireOrgContext();
  const { id } = await params;

  const report = await getReport(db, context.organizationId, id);
  if (!report) notFound();

  const runs = await listReportRuns(db, report.id);
  const template = getReportTemplate(report.templateKey);
  const canManageSchedule = context.permissions.includes("reports:write");

  const activeShareLinks = new Map(
    await Promise.all(
      runs
        .filter((run) => run.status === "completed")
        .map(async (run) => {
          const link = await getActiveReportShareLink(
            db,
            context.organizationId,
            run.id,
          );
          return [
            run.id,
            link ? { expiresAt: link.expiresAt.toISOString() } : null,
          ] as const;
        }),
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{report.name}</h1>
          <p className="text-sm text-muted-foreground">
            {template?.name ?? report.templateKey} ·{" "}
            {PERIOD_LABEL[report.periodType] ?? report.periodType}
          </p>
        </div>
        <RunAgainButton reportId={report.id} />
      </div>

      <ScheduleSection
        reportId={report.id}
        scheduleFrequency={report.scheduleFrequency}
        canManageSchedule={canManageSchedule}
      />

      <section>
        <h2 className="text-sm font-semibold text-foreground">Run history</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Requested</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Downloads</th>
                <th className="px-4 py-2 font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-3 text-muted-foreground">
                    {run.createdAt.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[run.status] ?? "neutral"}>
                      {run.status}
                    </Badge>
                    {run.status === "failed" && run.error ? (
                      <p className="mt-1 text-xs text-danger">
                        Report generation failed: {run.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {run.status === "completed" ? (
                      <div className="flex gap-3">
                        <a
                          className="text-primary underline underline-offset-2"
                          href={`/api/reports/${report.id}/runs/${run.id}/download?format=pdf`}
                        >
                          PDF
                        </a>
                        <a
                          className="text-primary underline underline-offset-2"
                          href={`/api/reports/${report.id}/runs/${run.id}/download?format=csv`}
                        >
                          CSV
                        </a>
                        <a
                          className="text-primary underline underline-offset-2"
                          href={`/api/reports/${report.id}/runs/${run.id}/download?format=xlsx`}
                        >
                          XLSX
                        </a>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not available</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {run.status === "completed" && canManageSchedule ? (
                      <ShareLinkControl
                        reportId={report.id}
                        runId={run.id}
                        initialActiveLink={activeShareLinks.get(run.id) ?? null}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
