import { Badge, EmptyState } from "@cim/ui";
import { Archive } from "lucide-react";
import { db, listArchiveRuns } from "@cim/db";
import { periodLabelForStart } from "@cim/core";
import { r2ConfigFromEnv } from "@cim/reports/archive";
import { requireOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import { ArchiveRunNow } from "./run-now";

const STATUS_TONE: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  building: "warning",
  ready: "success",
  failed: "danger",
};

function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export default async function ArchivePage() {
  const context = await requireOrgContext();
  const [runs, user] = await Promise.all([listArchiveRuns(db, context.organizationId), getCurrentUser()]);
  const configured = r2ConfigFromEnv(process.env) !== null;
  const canOpen = context.permissions.includes("reports:read");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Archive</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every week, Mediaory saves your mentions as a page you can open and a spreadsheet — headlines, short excerpts and
            links to the original publishers. Weeks stay here after the live data has been cleared. Weeks run Monday to Sunday
            (Türkiye time); the previous week is ready on Monday and we email you the link.
          </p>
        </div>
        {user?.isPlatformSuperAdmin ? <ArchiveRunNow /> : null}
      </div>

      {!configured ? (
        <p role="note" className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm text-muted-foreground">
          Archive storage is not set up on this deployment yet, so files can’t be opened.
        </p>
      ) : null}

      {runs.length === 0 ? (
        <EmptyState
          icon={<Archive className="size-8" aria-hidden="true" />}
          title="No archived weeks yet."
          description="Your first weekly archive appears here after a full Monday–Sunday week with mentions has ended."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Weekly archives</caption>
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Week</th>
                <th scope="col" className="px-4 py-2 font-medium">Mentions</th>
                <th scope="col" className="px-4 py-2 font-medium">Status</th>
                <th scope="col" className="px-4 py-2 font-medium">Open</th>
                <th scope="col" className="px-4 py-2 font-medium">Emailed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => {
                const html = run.files.find((file) => file.name === "archive.html");
                const xlsx = run.files.find((file) => file.name === "mentions.xlsx");
                return (
                  <tr key={run.id}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {periodLabelForStart(run.periodStart)}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {formatDay(run.periodStart)} – {formatDay(run.periodEnd)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {run.mentionCount.toLocaleString("en-GB")}
                      {run.truncated ? <span className="block text-xs">first 50,000 only</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[run.status] ?? "neutral"} className="capitalize">
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {run.status === "ready" && canOpen && configured ? (
                        <span className="flex flex-wrap gap-x-4 gap-y-1">
                          {html ? (
                            <a className="text-primary hover:underline" href={`/api/archive/${run.id}/archive.html`} target="_blank" rel="noopener noreferrer">
                              Open page ({formatBytes(html.bytes)})
                            </a>
                          ) : null}
                          {xlsx ? (
                            <a className="text-primary hover:underline" href={`/api/archive/${run.id}/mentions.xlsx`}>
                              Spreadsheet ({formatBytes(xlsx.bytes)})
                            </a>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{run.emailedAt ? formatDay(run.emailedAt.toISOString().slice(0, 10)) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
