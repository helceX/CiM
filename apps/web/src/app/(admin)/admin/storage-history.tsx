import { getStorageHistory } from "@/lib/operational-history";

export async function StorageHistory() {
  const history = await getStorageHistory();
  const latest = history?.at(-1);
  const previous = history?.at(-2);
  const stale = latest && Date.now() - Date.parse(latest.at) > 36 * 3_600_000;
  return (
    <section
      aria-labelledby="storage-history-heading"
      className="mt-4 rounded-lg border border-border p-4"
    >
      <h3
        id="storage-history-heading"
        className="text-sm font-semibold text-foreground"
      >
        Daily database size history
      </h3>
      {history === null ? (
        <p className="mt-2 text-sm">
          History unavailable — Redis could not be read or a measurement was invalid.
        </p>
      ) : !latest ? (
        <p className="mt-2 text-sm">
          No measurements recorded yet. The worker captures a baseline on startup and
          checks daily at 08:45 UTC.
        </p>
      ) : (
        <>
          {stale ? (
            <p className="mt-2 text-sm">
              Latest measurement is over 36 hours old. Check the worker and daily usage
              job.
            </p>
          ) : null}
          {previous ? (
            <p className="mt-2 text-sm">
              Change between the latest two measurements:{" "}
              {((latest.bytes - previous.bytes) / 1_048_576).toLocaleString("en-US", {
                maximumFractionDigits: 1,
                signDisplay: "always",
              })}{" "}
              MB over{" "}
              {(
                (Date.parse(latest.at) - Date.parse(previous.at)) /
                3_600_000
              ).toLocaleString("en-US", { maximumFractionDigits: 1 })}{" "}
              hours.
            </p>
          ) : (
            <p className="mt-2 text-sm">
              First baseline recorded. A second measured day is needed to show growth.
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Latest seven recorded days of database size
              </caption>
              <thead>
                <tr>
                  <th className="py-2 font-medium">Measured at (UTC)</th>
                  <th className="py-2 text-right font-medium">Database size</th>
                </tr>
              </thead>
              <tbody>
                {history
                  .slice(-7)
                  .reverse()
                  .map((sample) => (
                    <tr key={sample.at} className="border-t border-border">
                      <td className="py-2">
                        <time dateTime={sample.at}>
                          {sample.at.replace("T", " ").slice(0, 19)}
                        </time>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {(sample.bytes / 1_048_576).toLocaleString("en-US", {
                          maximumFractionDigits: 1,
                        })}{" "}
                        MB
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        One first successful measurement per UTC day, retained in Redis for 60 days; the
        latest seven measured days are shown. Missing days are not estimated. Redis data
        loss resets this history. Database size excludes other volume files and is not a
        disk-space forecast.
      </p>
    </section>
  );
}
