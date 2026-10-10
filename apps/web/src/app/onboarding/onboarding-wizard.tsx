"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Field, Input } from "@cim/ui";
import { mergeKeywords, parseKeywordList } from "@cim/core";
import type {
  CompleteOnboardingInput,
  NotificationPreference,
  SourceTypeSelection,
  TrackingTarget,
} from "@cim/validation";
import { TRACKING_TARGET_OPTIONS } from "@/lib/tracking-targets";

const SOURCE_TYPES: SourceTypeSelection[] = ["news", "web", "social", "video", "podcast", "forums", "comments", "trends", "all"];

// Each answer does something real (api/onboarding/complete): the first two create an alert rule for your first
// monitoring; the digest and the weekly archive e-mails reach everyone in the organization without one.
const NOTIFICATION_PREFERENCES: NotificationPreference[] = ["instant", "high_priority_only", "daily_digest", "weekly_summary"];

const TOTAL_STEPS = 5;

export function OnboardingWizard() {
  const t = useTranslations("onboarding");
  const targets = useTranslations("trackingTargets");
  const common = useTranslations("errors");
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [trackingTarget, setTrackingTarget] = useState<TrackingTarget>("company");
  const [projectName, setProjectName] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [sourceTypes, setSourceTypes] = useState<SourceTypeSelection[]>(["news", "web"]);
  const [notificationPreference, setNotificationPreference] =
    useState<NotificationPreference>("high_priority_only");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // One keyword = one comma-separated item (a word or a whole sentence).
  function addKeyword() {
    const additions = parseKeywordList(keywordInput);
    if (additions.length === 0) return;
    setKeywords(mergeKeywords(keywords, additions));
    setKeywordInput("");
    if (!projectName) setProjectName(additions[0] ?? "");
  }

  function removeKeyword(value: string) {
    setKeywords(keywords.filter((k) => k !== value));
  }

  function toggleSourceType(value: SourceTypeSelection) {
    setSourceTypes((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  }

  async function finish() {
    setError(null);
    setIsSubmitting(true);
    const payload: CompleteOnboardingInput = {
      trackingTarget,
      keywords,
      sourceTypes,
      notificationPreference,
      projectName: projectName || keywords[0] || t("defaultProject"),
    };
    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? common("generic"));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(common("generic"));
    } finally {
      setIsSubmitting(false);
    }
  }

  const canAdvance =
    (step === 1 && Boolean(trackingTarget)) ||
    (step === 2 && keywords.length > 0) ||
    (step === 3 && sourceTypes.length > 0) ||
    step === 4 ||
    step === 5;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-16">
      <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("step", { step, total: TOTAL_STEPS })}
      </p>

      {step === 1 ? (
        <StepShell title={t("track.title")}>
          <div className="grid grid-cols-2 gap-2">
            {TRACKING_TARGET_OPTIONS.map((target) => (
              <button
                key={target.value}
                type="button"
                onClick={() => setTrackingTarget(target.value)}
                className={`rounded border px-3 py-2 text-left text-sm transition-colors ${
                  trackingTarget === target.value
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:bg-surface-muted"
                }`}
              >
                {targets(target.value)}
              </button>
            ))}
          </div>
        </StepShell>
      ) : null}

      {step === 2 ? (
        <StepShell title={t("keywords.title")}>
          <div className="flex gap-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder={t("keywords.placeholder")}
              aria-label={t("keywords.label")}
            />
            <Button type="button" variant="secondary" onClick={addKeyword}>
              {t("keywords.add")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("keywords.help")}
          </p>
          {keywords.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <li
                  key={keyword}
                  className="flex items-center gap-2 rounded-sm bg-secondary px-2.5 py-1 text-sm text-secondary-foreground"
                >
                  {keyword}
                  <button
                    type="button"
                    onClick={() => removeKeyword(keyword)}
                    aria-label={t("keywords.remove", { keyword })}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("keywords.empty")}
            </p>
          )}
        </StepShell>
      ) : null}

      {step === 3 ? (
        <StepShell title={t("sources.title")}>
          <div className="grid grid-cols-2 gap-3">
            {SOURCE_TYPES.map((source) => (
              <label key={source} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={sourceTypes.includes(source)}
                  onCheckedChange={() => toggleSourceType(source)}
                />
                {t(`sources.types.${source}`)}
              </label>
            ))}
          </div>
        </StepShell>
      ) : null}

      {step === 4 ? (
        <StepShell title={t("notify.title")}>
          <div className="flex flex-col gap-2">
            {NOTIFICATION_PREFERENCES.map((pref) => (
              <label
                key={pref}
                className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 ${
                  notificationPreference === pref ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="notificationPreference"
                  className="mt-1"
                  checked={notificationPreference === pref}
                  onChange={() => setNotificationPreference(pref)}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{t(`notify.${pref}.label`)}</span>
                  <span className="block text-sm text-muted-foreground">{t(`notify.${pref}.desc`)}</span>
                </span>
              </label>
            ))}
          </div>
        </StepShell>
      ) : null}

      {step === 5 ? (
        <StepShell title={t("project.title")}>
          <Field id="projectName" label={t("project.label")} required>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </Field>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("project.summary", { keywords: keywords.length, sources: sourceTypes.length })}
          </p>
        </StepShell>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          {t("back")}
        </Button>
        {step < TOTAL_STEPS ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
            {t("continue")}
          </Button>
        ) : (
          <Button type="button" onClick={finish} disabled={isSubmitting}>
            {isSubmitting ? t("finishing") : t("finish")}
          </Button>
        )}
      </div>
    </div>
  );
}

function StepShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4 flex flex-col gap-1">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}
