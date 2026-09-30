import type { CreditSummary, FeatureUsageSnapshot } from "@cim/db";

/**
 * docs/architecture/DATA_MODEL.md "Subscription / FeatureUsage" +
 * FEATURE_MATRIX.md "Billing: Usage counters only" (MVP) — read-only
 * display; nothing here enforces a limit against `plan` yet ("Plan
 * enforcement" is its own, separate P3 row). Snapshots are captured once
 * daily by the worker (apps/worker/src/jobs/capture-feature-usage.ts),
 * so a brand-new organization legitimately shows "not captured yet"
 * until the first run — the same "Not available" discipline as every
 * other worker-populated surface in this app, never a fabricated zero.
 */
export function UsageSection({
  plan,
  usage,
  trackedKeywords,
  credits,
}: {
  plan: string;
  usage: FeatureUsageSnapshot | undefined;
  trackedKeywords: number;
  credits: CreditSummary;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">Plan & usage</h2>
      <p className="mt-1 text-sm text-foreground">
        Current plan: <span className="font-medium capitalize">{plan}</span>
      </p>
      {usage ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Monitoring queries</dt>
              <dd className="text-foreground">{usage.keywordsCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Sources</dt>
              <dd className="text-foreground">{usage.sourcesCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mentions</dt>
              <dd className="text-foreground">{usage.mentionsCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">AI credits used</dt>
              <dd className="text-foreground">{usage.aiCreditsCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reports</dt>
              <dd className="text-foreground">{usage.reportsCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Users</dt>
              <dd className="text-foreground">{usage.usersCount}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            As of {new Date(usage.capturedAt).toLocaleString()}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Not captured yet — usage snapshots are captured daily.
        </p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-medium text-foreground">Credits</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Tracked keywords now</dt>
            <dd className="text-foreground">{trackedKeywords}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Used, last {credits.windowDays} days</dt>
            <dd className="text-foreground">{credits.usedInWindow}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Average per day</dt>
            <dd className="text-foreground">
              {credits.averageDailyUse === null ? "—" : Math.round(credits.averageDailyUse * 10) / 10}
            </dd>
          </div>
          {credits.grantedTotal > 0 ? (
            <div>
              <dt className="text-xs text-muted-foreground">Balance</dt>
              <dd className="text-foreground">{credits.balance}</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          One credit per tracked keyword per day. A keyword is a distinct include term or exact
          phrase across your active queries; exclusions are free. Credits are measured only — nothing
          is charged or limited yet.
        </p>
      </div>
    </section>
  );
}
