import Link from "next/link";
import { Badge, Button, EmptyState } from "@cim/ui";
import { FileText } from "lucide-react";
import { db, listReports } from "@cim/db";
import { getReportTemplate } from "@cim/reports/templates";
import { requireOrgContext } from "@/lib/tenant";

const STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  queued: "neutral",
  running: "warning",
  completed: "success",
  failed: "danger",
};

export default async function ReportsListPage() {
  const context = await requireOrgContext();
  const items = await listReports(db, context.organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Fixed-template PDF/CSV exports, generated on demand.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/reports/new">New report</Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-8" aria-hidden="true" />}
          title="No reports yet."
          description="Generate a fixed-template report to export a period's mentions as PDF and CSV."
          action={
            <Button asChild size="sm">
              <Link href="/reports/new">Create your first report</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Template</th>
                <th className="px-4 py-2 font-medium">Latest run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map(({ report, projectName, latestRun }) => (
                <tr key={report.id} className="cursor-default">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link href={`/reports/${report.id}`} className="hover:underline">
                      {report.name}
                    </Link>
                    {report.scheduleFrequency !== "none" ? (
                      <Badge tone="info" className="ml-2 align-middle capitalize">
                        {report.scheduleFrequency}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{projectName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {getReportTemplate(report.templateKey)?.name ?? report.templateKey}
                  </td>
                  <td className="px-4 py-3">
                    {latestRun ? (
                      <Badge tone={STATUS_TONE[latestRun.status] ?? "neutral"}>
                        {latestRun.status}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Not available</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
