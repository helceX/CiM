import { FEED_FAILURE_LABELS, isTransientFeedFailure } from "@cim/core";
import { getSourceDiagnostics } from "@/lib/operational-history";

type Source = { id: string; name: string; status: string };
export async function SourceDiagnostics({ sources }: { sources: Source[] }) {
  const problems = sources.filter((source) =>
    ["error", "blocked", "delayed"].includes(source.status),
  );
  const sample = problems.slice(0, 200);
  const diagnostics = await getSourceDiagnostics(sample.map((source) => source.id));
  const counts = new Map<string, number>();
  for (const source of sample) {
    const diagnostic = diagnostics?.[source.id];
    const label = !diagnostic
      ? "Reason not recorded yet"
      : diagnostic.stage === "ingestion"
        ? "Processing failed"
        : FEED_FAILURE_LABELS[diagnostic.category];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return (
    <section
      aria-labelledby="diagnostics-heading"
      className="rounded-lg border border-border p-4"
    >
      <h2 id="diagnostics-heading" className="text-sm font-semibold text-foreground">
        Source failure diagnostics
      </h2>
      <p className="mt-2 text-sm">
        {problems.length.toLocaleString()} sources need attention; showing{" "}
        {sample.length.toLocaleString()}, ordered by latest recorded source check.
        Paused sources are excluded.
      </p>
      {diagnostics === null ? (
        <p className="mt-2 text-sm">
          Diagnostics unavailable — Redis could not be read.
        </p>
      ) : sample.length === 0 ? (
        <p className="mt-2 text-sm">
          No sources are currently marked delayed, errored or blocked.
        </p>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            {[...counts]
              .sort((a, b) => b[1] - a[1])
              .map(([label, count]) => (
                <li key={label} className="rounded border border-border px-2 py-1">
                  {label}: {count}
                </li>
              ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer py-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Show failure details ({sample.length})
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Recent failure reasons and earliest next fetch for problem sources
                </caption>
                <thead>
                  <tr>
                    {[
                      "Source",
                      "Reason / next step",
                      "Last failed check (UTC)",
                      "Consecutive failures",
                      "Earliest next fetch (UTC)",
                    ].map((label) => (
                      <th key={label} className="px-3 py-2 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sample.map((source) => {
                    const diagnostic = diagnostics[source.id];
                    const reason = !diagnostic
                      ? "Not recorded yet"
                      : diagnostic.stage === "ingestion"
                        ? "Processing failed — publisher or database cause unconfirmed"
                        : FEED_FAILURE_LABELS[diagnostic.category];
                    const guidance = !diagnostic
                      ? "Captured on the next failed check."
                      : diagnostic.stage === "ingestion" ||
                          diagnostic.category === "other"
                        ? "Inspect worker and database logs."
                        : isTransientFeedFailure(diagnostic.category)
                          ? "Automatic retry; investigate if repeated."
                          : ["blocked", "policy"].includes(diagnostic.category)
                            ? "Check publisher permissions; respect restrictions."
                            : "Verify the publisher's current feed before changing its address.";
                    return (
                      <tr key={source.id} className="border-t border-border">
                        <td className="px-3 py-2">{source.name}</td>
                        <td className="px-3 py-2">
                          {reason}
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {guidance}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {diagnostic
                            ? new Date(diagnostic.checkedAt)
                                .toISOString()
                                .replace("T", " ")
                                .slice(0, 19)
                            : "Unknown"}
                        </td>
                        <td className="px-3 py-2">
                          {diagnostic?.failures ?? "Unknown"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {diagnostic?.nextAt
                            ? new Date(diagnostic.nextAt)
                                .toISOString()
                                .replace("T", " ")
                                .slice(0, 19)
                            : diagnostic
                              ? "Normal job retry policy"
                              : "Unknown"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Reasons are recorded from this release onward and expire with crawl memory after
        three days. Only a safe category is stored. An earliest fetch time is a limit,
        not a promised execution time. Successful checks clear the previous failure.
      </p>
    </section>
  );
}
