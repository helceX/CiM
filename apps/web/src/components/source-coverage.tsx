import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { db, getMonitoringSourceCoverage, type OrganizationId } from "@cim/db";

export async function SourceCoverage({
  organizationId,
}: {
  organizationId: OrganizationId;
}) {
  const t = await getTranslations("sourceCoverage");
  const locale = await getLocale();
  const coverage = await getMonitoringSourceCoverage(db, organizationId).catch(
    () => undefined,
  );
  if (coverage === null) return null;
  return (
    <section
      className="rounded-lg border border-border p-4"
      aria-labelledby="source-coverage-heading"
    >
      <h2 id="source-coverage-heading" className="font-semibold">
        {t("title")}
      </h2>
      {coverage === undefined ? (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {t("unavailable")}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            {t("counts", {
              total: coverage.total,
              healthy: coverage.healthy,
              attention: coverage.attention,
              paused: coverage.paused,
            })}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("geography", {
              countries: coverage.countries,
              languages: coverage.languages,
            })}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("checked", {
              time: coverage.lastHealthyCheck
                ? new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Europe/Istanbul",
                  }).format(new Date(coverage.lastHealthyCheck)) + " (GMT+3)"
                : t("never"),
            })}
          </p>
          {coverage.active === 0 ? (
            <p className="mt-2 text-sm text-warning">{t("noActive")}</p>
          ) : null}
        </>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("help")}</p>
      <Link
        href="/monitoring"
        className="mt-3 inline-block text-sm text-primary underline"
      >
        {t("edit")}
      </Link>
    </section>
  );
}
