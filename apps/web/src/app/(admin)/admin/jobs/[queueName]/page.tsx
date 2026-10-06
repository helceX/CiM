import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState } from "@cim/ui";
import { requireSuperAdmin } from "@/lib/admin";
import { db, getSourceLabels } from "@cim/db";
import { getFailedJobsForQueue, getQueuedJobsForQueue, isKnownQueueName } from "@/lib/admin-queues";

/**
 * docs/product/FEATURE_MATRIX.md P2 "Full observability views" — the
 * per-job drill-down admin-queues.ts's getQueueHealth comment points at.
 * `requireSuperAdmin()` here is defense-in-depth on top of the (admin)
 * layout's own guard (docs/architecture/SECURITY.md brief §86).
 */
export default async function AdminQueueJobsPage({
  params,
}: {
  params: Promise<{ queueName: string }>;
}) {
  await requireSuperAdmin();
  const { queueName } = await params;

  // Never pass an unvalidated route param straight into `new Queue(...)` —
  // a stray query on an arbitrary Redis key is not our biggest risk here,
  // but "only ever the queues this app actually registers" is a cheap,
  // clear guarantee to keep.
  if (!isKnownQueueName(queueName)) {
    notFound();
  }

  const [jobs, active, waiting] = await Promise.all([
    getFailedJobsForQueue(queueName),
    getQueuedJobsForQueue(queueName, "active", 50),
    getQueuedJobsForQueue(queueName, "waiting", 50),
  ]);
  const sourceIds = [...new Set([...active, ...waiting].map((job) => job.sourceId).filter((id): id is string => id !== null))];
  const labels = await getSourceLabels(db, sourceIds);

  const queuedSection = (title: string, note: string, rows: typeof waiting) => (
    <section>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground">{note}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">None right now.</p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {rows.map((job) => {
                const label = job.sourceId ? labels.get(job.sourceId) : undefined;
                return (
                  <tr key={job.id}>
                    <td className="px-4 py-2 text-foreground">
                      {label ? label.name : <span className="font-mono text-xs">{job.name}</span>}
                      <div className="break-all font-mono text-xs text-muted-foreground">{label?.url ?? job.data}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">queued {new Date(job.createdAt).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin" className="text-xs text-primary underline underline-offset-2">
          ← Platform overview
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-foreground">
          Jobs — <span className="font-mono">{queueName}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Running and waiting jobs (up to 50 each, oldest first) and the {jobs.length} most recent failures.
        </p>
      </div>

      {queuedSection("Running now", "Being processed at this moment.", active)}
      {queuedSection("Waiting", "Next in line.", waiting)}

      <h2 className="text-sm font-semibold text-foreground">Failed</h2>

      {jobs.length === 0 ? (
        <EmptyState title="No failed jobs" description="This queue has no failed jobs right now." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Failed at</th>
                <th className="px-4 py-2 font-medium">Attempts</th>
                <th className="px-4 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-4 py-3 align-top font-mono text-xs text-foreground">
                    {job.name}
                    <div className="text-muted-foreground">{job.id}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {new Date(job.failedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">{job.attemptsMade}</td>
                  <td className="px-4 py-3 align-top text-foreground">
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                      {job.failedReason}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin">Back to overview</Link>
        </Button>
      </div>
    </div>
  );
}
