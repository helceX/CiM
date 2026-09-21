import { notFound } from "next/navigation";
import { Badge } from "@cim/ui";
import { db, getReport, listReportRuns } from "@cim/db";
import { getReportTemplate } from "@cim/reports/templates";
import { requireOrgContext } from "@/lib/tenant";
import { RunAgainButton } from "./run-again-button";

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

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOrgContext();
  const { id } = await params;

  const report = await getReport(db, context.organizationId, id);
  if (!report) notFound();

  const runs = await listReportRuns(db, report.id);
  const template = getReportTemplate(report.templateKey);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{report.name}</h1>
          <p className="text-sm text-muted-foreground">
            {template?.name ?? report.templateKey} · {PERIOD_LABEL[report.periodType] ?? report.periodType}
          </p>
        </div>
        <RunAgainButton reportId={report.id} />
      </div>

      <section>
        <h2 className="text-sm font-semibold text-foreground">Run history</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Requested</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Downloads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-3 text-muted-foreground">
                    {run.createdAt.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[run.status] ?? "neutral"}>{run.status}</Badge>
                    {run.status === "failed" && run.error ? (
                      <p className="mt-1 text-xs text-danger">Report generation failed: {run.error}</p>
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
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Not available</span>
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
