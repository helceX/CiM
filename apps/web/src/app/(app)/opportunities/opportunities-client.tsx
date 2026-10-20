"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ProfileChoiceField } from "./profile-choice-field";
import { readProfileTerms, readProfileSingle } from "./profile-form-data";
import { filterOpportunityReviews, type ReviewFilter } from "./review-filter";

type Profile = {
  organizationType: string;
  sector: string;
  startupStage: string;
  operatingRegions: string[];
  sectors: string[];
  technologies: string[];
  themes: string[];
  opportunityTypes: string[];
  eligibilityConstraints: string[];
  languages: string[];
} | null;
type Member = { userId: string; name: string };
type Followup = {
  status: string;
  assignedToUserId: string | null;
  note: string;
  dueAt: string | null;
  sourceVerified: boolean;
  assigneeName: string | null;
} | null;
type Candidate = {
  mentionId: string;
  title: string;
  url: string;
  excerpt: string | null;
  sourceName: string;
  sourceDomain: string;
  publishedAt: string | null;
  observedAt: string;
  match: {
    score: number;
    matchedThemes: string[];
    reasons: string[];
    requiresVerification: string[];
    verification: {
      checkOpenStatus: boolean;
      checkPublisherTerms: boolean;
      organizationType?: string;
      regions: string[];
      constraints: string[];
    };
  };
  followup: Followup;
};

const EMPTY_PROFILE: NonNullable<Profile> = {
  organizationType: "company",
  sector: "",
  startupStage: "",
  operatingRegions: [],
  sectors: [],
  technologies: [],
  themes: [],
  opportunityTypes: [],
  eligibilityConstraints: [],
  languages: ["tr"],
};
const FOLLOWUP_STATUSES = [
  "new",
  "reviewing",
  "possibly_eligible",
  "not_eligible",
  "planning",
  "preparing",
  "submitted",
  "won",
  "pending_outcome",
  "not_awarded",
  "archived",
] as const;
const ORG_TYPES = [
  "company",
  "nonprofit",
  "university",
  "public",
  "cooperative",
  "other",
] as const;
const TYPE_LABELS: Record<
  (typeof ORG_TYPES)[number],
  | "types.company"
  | "types.nonprofit"
  | "types.university"
  | "types.public"
  | "types.cooperative"
  | "types.other"
> = {
  company: "types.company",
  nonprofit: "types.nonprofit",
  university: "types.university",
  public: "types.public",
  cooperative: "types.cooperative",
  other: "types.other",
};
const STATUS_LABELS: Record<
  (typeof FOLLOWUP_STATUSES)[number],
  | "statuses.new"
  | "statuses.reviewing"
  | "statuses.possibly_eligible"
  | "statuses.not_eligible"
  | "statuses.planning"
  | "statuses.preparing"
  | "statuses.submitted"
  | "statuses.won"
  | "statuses.pending_outcome"
  | "statuses.not_awarded"
  | "statuses.archived"
> = {
  new: "statuses.new",
  reviewing: "statuses.reviewing",
  possibly_eligible: "statuses.possibly_eligible",
  not_eligible: "statuses.not_eligible",
  planning: "statuses.planning",
  preparing: "statuses.preparing",
  submitted: "statuses.submitted",
  won: "statuses.won",
  pending_outcome: "statuses.pending_outcome",
  not_awarded: "statuses.not_awarded",
  archived: "statuses.archived",
};

export function OpportunitiesClient({
  profile,
  candidates,
  members,
  canWrite,
  selectedRange,
}: {
  profile: Profile;
  candidates: Candidate[];
  members: Member[];
  canWrite: boolean;
  selectedRange: string;
}) {
  const t = useTranslations("opportunities");
  const locale = useLocale();
  const [groupBy, setGroupBy] = useState("date");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [page, setPage] = useState(0);
  const sorted = filterOpportunityReviews(candidates, reviewFilter).sort((a, b) => Date.parse(b.publishedAt ?? b.observedAt) - Date.parse(a.publishedAt ?? a.observedAt));
  const pageCount = Math.max(1, Math.ceil(sorted.length / 10));
  const groups = new Map<string, Candidate[]>();
  for (const candidate of sorted.slice(page * 10, page * 10 + 10)) {
    const key = groupBy === "source" ? candidate.sourceName : groupBy === "status"
      ? t(STATUS_LABELS[(candidate.followup?.status ?? "new") as keyof typeof STATUS_LABELS] ?? "statuses.new")
      : new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(new Date(candidate.publishedAt ?? candidate.observedAt));
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const current = profile ?? EMPTY_PROFILE;

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      organizationType: String(data.get("organizationType")),
      sector: readProfileSingle(data, "sector"),
      startupStage: readProfileSingle(data, "startupStage"),
      operatingRegions: readProfileTerms(data, "operatingRegions"),
      sectors: readProfileTerms(data, "sectors"),
      technologies: readProfileTerms(data, "technologies"),
      themes: readProfileTerms(data, "themes"),
      opportunityTypes: readProfileTerms(data, "opportunityTypes"),
      eligibilityConstraints: readProfileTerms(data, "eligibilityConstraints"),
      languages: data.getAll("languages").map(String),
    };
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/opportunities/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSaving(false);
    setMessage(response?.ok ? t("profileSaved") : t("saveFailed"));
    if (response?.ok) window.location.reload();
  }

  async function saveFollowup(
    event: React.FormEvent<HTMLFormElement>,
    candidate: Candidate,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const due = String(data.get("dueAt") ?? "");
    const response = await fetch(`/api/opportunities/${candidate.mentionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: data.get("status"),
        assignedToUserId: data.get("assignedToUserId") || null,
        note: data.get("note"),
        dueAt: due ? new Date(`${due}T23:59:59`).toISOString() : null,
        sourceVerified: data.get("sourceVerified") === "on",
      }),
    }).catch(() => null);
    setMessage(response?.ok ? t("followupSaved") : t("saveFailed"));
    if (response?.ok) window.location.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1>{t("title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
      </header>

      <details open={!profile} className="rounded-xl border border-border bg-card p-5">
        <summary className="cursor-pointer text-lg font-semibold">{t("profileTitle")}</summary>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">{t("profileHelp")}</p>
        <form onSubmit={saveProfile} className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("organizationType")}
            <select
              name="organizationType"
              defaultValue={current.organizationType}
              disabled={!canWrite}
              className="rounded-md border border-border bg-background px-3 py-2"
            >
              {ORG_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(TYPE_LABELS[value])}
                </option>
              ))}
            </select>
          </label>
          <ProfileChoiceField
            name="sector"
            label={t("sector")}
            values={current.sector ? [current.sector] : []}
            disabled={!canWrite}
            single
          />
          <ProfileChoiceField
            name="startupStage"
            label={t("stage")}
            values={current.startupStage ? [current.startupStage] : []}
            disabled={!canWrite}
            single
          />
          <ProfileChoiceField
            name="operatingRegions"
            label={t("regions")}
            values={current.operatingRegions}
            disabled={!canWrite}
          />
          <ProfileChoiceField
            name="sectors"
            label={t("sectors")}
            values={current.sectors}
            disabled={!canWrite}
          />
          <ProfileChoiceField
            name="technologies"
            label={t("technologies")}
            values={current.technologies}
            disabled={!canWrite}
          />
          <ProfileChoiceField
            name="themes"
            label={t("themes")}
            values={current.themes}
            disabled={!canWrite}
          />
          <ProfileChoiceField
            name="opportunityTypes"
            label={t("opportunityTypes")}
            values={current.opportunityTypes}
            disabled={!canWrite}
          />
          <ProfileChoiceField
            name="eligibilityConstraints"
            label={t("constraints")}
            values={current.eligibilityConstraints}
            disabled={!canWrite}
            hint={t("constraintsHelp")}
          />
          <fieldset
            className="flex items-center gap-4 text-sm md:col-span-2"
            disabled={!canWrite}
          >
            <legend>{t("languages")}</legend>
            {(["tr", "en"] as const).map((language) => (
              <label key={language} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="languages"
                  value={language}
                  defaultChecked={current.languages.includes(language)}
                />
                {language.toUpperCase()}
              </label>
            ))}
          </fieldset>
          {canWrite ? (
            <div className="flex items-end">
              <button
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? t("saving") : t("saveProfile")}
              </button>
            </div>
          ) : null}
        </form>
        {message ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
      </details>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t("signalsTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("signalsHelp")}</p>
          </div>
          <span className="text-sm text-muted-foreground">{sorted.length} / {candidates.length}</span>
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <form action="/opportunities" className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">{t("dateRange")}
              <select name="since" defaultValue={selectedRange} className="rounded-md border border-border bg-background px-3 py-2">
                {["7", "30", "90", "all"].map(value => <option key={value} value={value}>{value === "all" ? t("allDates") : t("lastDays", { days: Number(value) })}</option>)}
              </select>
            </label>
            <button className="rounded-md border border-border px-3 py-2 text-sm">{t("applyFilters")}</button>
          </form>
          <label className="flex flex-col gap-1 text-sm">{t("groupBy")}
            <select value={groupBy} onChange={event => { setGroupBy(event.target.value); setPage(0); }} className="rounded-md border border-border bg-background px-3 py-2">
              <option value="date">{t("groupDate")}</option><option value="source">{t("groupSource")}</option><option value="status">{t("followupStatus")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">{locale === "tr" ? "İnceleme durumu" : "Review state"}
            <select value={reviewFilter} onChange={event => { setReviewFilter(event.target.value as ReviewFilter); setPage(0); }} className="rounded-md border border-border bg-background px-3 py-2">
              <option value="all">{locale === "tr" ? "Tüm sinyaller" : "All signals"}</option>
              <option value="source_checked">{locale === "tr" ? "Kaynağı kontrol edilen" : "Source checked"}</option>
              <option value="unreviewed">{locale === "tr" ? "Henüz incelenmeyen" : "Not yet reviewed"}</option>
              <option value="archived">{locale === "tr" ? "Arşivlenen" : "Archived"}</option>
            </select>
          </label>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t("dateHelp")}</p>
        <p className="mb-3 text-xs text-muted-foreground">{locale === "tr" ? "Kaynak kontrolü kullanıcı tarafından kaydedilir; başvurunun açık olduğunu veya kuruluşunuzun uygunluğunu otomatik doğrulamaz. Kapanmış veya ilgisiz sinyalleri inceleyip arşivleyebilirsiniz." : "Source checks are recorded by users; they do not automatically verify application availability or eligibility. Review and archive closed or irrelevant signals."}</p>
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            {candidates.length > 0 ? (locale === "tr" ? "Bu inceleme filtresine uyan sinyal yok. Tüm sinyalleri seçerek geri dönün." : "No signals match this review filter. Select all signals to return.") : profile ? t("empty") : t("setupFirst")}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {[...groups].map(([group, items]) => <section key={group} className="flex flex-col gap-3" aria-label={group}>
              <h3 className="text-sm font-semibold text-muted-foreground">{group} · {items.length}</h3>
            {items.map((candidate) => (
              <article
                key={candidate.mentionId}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("signalLabel")} · {candidate.sourceName} (
                      {candidate.sourceDomain})
                    </p>
                    <h3 className="mt-2 text-base font-semibold">
                      <a
                        href={candidate.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-border underline-offset-4"
                      >
                        {candidate.title}
                      </a>
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("published")}:{" "}
                      {candidate.publishedAt
                        ? new Date(candidate.publishedAt).toLocaleDateString()
                        : t("unknown")}{" "}
                      · {t("observed")}:{" "}
                      {new Date(candidate.observedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs">
                    {candidate.match.score}% {t("profileOverlap")}
                  </span>
                </div>
                {candidate.excerpt ? (
                  <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                    {candidate.excerpt}
                  </p>
                ) : null}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">{t("showDetails")} · {t(STATUS_LABELS[(candidate.followup?.status ?? "new") as keyof typeof STATUS_LABELS] ?? "statuses.new")}</summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-medium">{t("whyMatched")}</h4>
                    {candidate.match.matchedThemes.length ? (
                      <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                        {candidate.match.matchedThemes.map((theme) => (
                          <li key={theme}>{t("themeReason", { theme })}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("noThemeMatch")}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3">
                    <h4 className="text-sm font-medium">{t("verificationTitle")}</h4>
                    <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                      {candidate.match.verification.checkOpenStatus ? (
                        <li>{t("checkOpenStatus")}</li>
                      ) : null}
                      {candidate.match.verification.checkPublisherTerms ? (
                        <li>{t("checkPublisherTerms")}</li>
                      ) : null}
                      {candidate.match.verification.organizationType ? (
                        <li>
                          {t("checkOrgType", {
                            type: t(
                              TYPE_LABELS[
                                candidate.match.verification
                                  .organizationType as keyof typeof TYPE_LABELS
                              ] ?? "types.other",
                            ),
                          })}
                        </li>
                      ) : null}
                      {candidate.match.verification.regions.length ? (
                        <li>
                          {t("checkRegions", {
                            regions: candidate.match.verification.regions.join(", "),
                          })}
                        </li>
                      ) : null}
                      {candidate.match.verification.constraints.map((constraint) => (
                        <li key={constraint}>{t("checkConstraint", { constraint })}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs font-medium">
                      {candidate.followup?.sourceVerified
                        ? t("verifiedByTeam")
                        : t("notVerified")}
                    </p>
                  </div>
                </div>
                {canWrite ? (
                  <form
                    onSubmit={(event) => saveFollowup(event, candidate)}
                    className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2"
                  >
                    <label className="flex flex-col gap-1 text-xs">
                      {t("followupStatus")}
                      <select
                        name="status"
                        defaultValue={candidate.followup?.status ?? "new"}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        {FOLLOWUP_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {t(STATUS_LABELS[status])}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {t("assignee")}
                      <select
                        name="assignedToUserId"
                        defaultValue={candidate.followup?.assignedToUserId ?? ""}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <option value="">{t("unassigned")}</option>
                        {members.map((member) => (
                          <option value={member.userId} key={member.userId}>
                            {member.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      {t("dueDate")}
                      <input
                        name="dueAt"
                        type="date"
                        defaultValue={candidate.followup?.dueAt?.slice(0, 10) ?? ""}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-2 pt-5 text-xs">
                      <input
                        type="checkbox"
                        name="sourceVerified"
                        defaultChecked={candidate.followup?.sourceVerified ?? false}
                      />
                      {t("teamCheckedSource")}
                    </label>
                    <label className="flex flex-col gap-1 text-xs md:col-span-2">
                      {t("notes")}
                      <textarea
                        name="note"
                        rows={2}
                        maxLength={4000}
                        defaultValue={candidate.followup?.note ?? ""}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="md:col-span-2">
                      <button className="rounded-md border border-border px-3 py-2 text-sm">
                        {t("saveFollowup")}
                      </button>
                    </div>
                  </form>
                ) : null}
                </details>
              </article>
            ))}
            </section>)}
            <nav aria-label={t("pagination")} className="flex items-center justify-between gap-3">
              <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40">{t("previous")}</button>
              <span className="text-sm">{t("pageOf", { page: page + 1, total: pageCount })}</span>
              <button disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-40">{t("next")}</button>
            </nav>
          </div>
        )}
      </section>
    </div>
  );
}
