"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

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
const splitTerms = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  ),
];

export function OpportunitiesClient({
  profile,
  candidates,
  members,
  canWrite,
}: {
  profile: Profile;
  candidates: Candidate[];
  members: Member[];
  canWrite: boolean;
}) {
  const t = useTranslations("opportunities");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const current = profile ?? EMPTY_PROFILE;

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      organizationType: String(data.get("organizationType")),
      sector: String(data.get("sector") ?? ""),
      startupStage: String(data.get("startupStage") ?? ""),
      operatingRegions: splitTerms(String(data.get("operatingRegions") ?? "")),
      sectors: splitTerms(String(data.get("sectors") ?? "")),
      technologies: splitTerms(String(data.get("technologies") ?? "")),
      themes: splitTerms(String(data.get("themes") ?? "")),
      opportunityTypes: splitTerms(String(data.get("opportunityTypes") ?? "")),
      eligibilityConstraints: splitTerms(
        String(data.get("eligibilityConstraints") ?? ""),
      ),
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

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{t("profileTitle")}</h2>
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
          <TextField
            name="sector"
            label={t("sector")}
            value={current.sector}
            disabled={!canWrite}
          />
          <TextField
            name="startupStage"
            label={t("stage")}
            value={current.startupStage}
            disabled={!canWrite}
          />
          <TextField
            name="operatingRegions"
            label={t("regions")}
            value={current.operatingRegions.join(", ")}
            disabled={!canWrite}
          />
          <TextField
            name="sectors"
            label={t("sectors")}
            value={current.sectors.join(", ")}
            disabled={!canWrite}
          />
          <TextField
            name="technologies"
            label={t("technologies")}
            value={current.technologies.join(", ")}
            disabled={!canWrite}
          />
          <TextField
            name="themes"
            label={t("themes")}
            value={current.themes.join(", ")}
            disabled={!canWrite}
            hint={t("commaSeparated")}
          />
          <TextField
            name="opportunityTypes"
            label={t("opportunityTypes")}
            value={current.opportunityTypes.join(", ")}
            disabled={!canWrite}
          />
          <TextField
            name="eligibilityConstraints"
            label={t("constraints")}
            value={current.eligibilityConstraints.join(", ")}
            disabled={!canWrite}
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
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t("signalsTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("signalsHelp")}</p>
          </div>
          <span className="text-sm text-muted-foreground">{candidates.length}</span>
        </div>
        {candidates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
            {profile ? t("empty") : t("setupFirst")}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {candidates.map((candidate) => (
              <article
                key={candidate.mentionId}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("signalLabel")} � {candidate.sourceName} (
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
                      � {t("observed")}:{" "}
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
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TextField({
  name,
  label,
  value,
  disabled,
  hint,
}: {
  name: string;
  label: string;
  value: string;
  disabled: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <input
        name={name}
        defaultValue={value}
        disabled={disabled}
        maxLength={1000}
        className="rounded-md border border-border bg-background px-3 py-2 disabled:opacity-60"
      />
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

