"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Field, Input } from "@cim/ui";
import type {
  CompleteOnboardingInput,
  NotificationPreference,
  SourceTypeSelection,
  TrackingTarget,
} from "@cim/validation";
import { TRACKING_TARGET_OPTIONS } from "@/lib/tracking-targets";

const SOURCE_TYPES: { value: SourceTypeSelection; label: string }[] = [
  { value: "news", label: "News" },
  { value: "web", label: "Web" },
  { value: "social", label: "Social" },
  { value: "video", label: "Video" },
  { value: "podcast", label: "Podcast" },
  { value: "forums", label: "Forums" },
  { value: "comments", label: "Comments" },
  { value: "all", label: "All available sources" },
];

const NOTIFICATION_PREFERENCES: { value: NotificationPreference; label: string; desc: string }[] = [
  { value: "instant", label: "Instant", desc: "Notify me as soon as something matches." },
  { value: "high_priority_only", label: "High priority only", desc: "Only critical/high alerts." },
  { value: "daily_digest", label: "Daily digest", desc: "One summary email per day." },
  { value: "weekly_summary", label: "Weekly summary", desc: "One summary email per week." },
];

const TOTAL_STEPS = 5;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [trackingTarget, setTrackingTarget] = useState<TrackingTarget>("company");
  const [projectName, setProjectName] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [sourceTypes, setSourceTypes] = useState<SourceTypeSelection[]>(["news", "web"]);
  const [notificationPreference, setNotificationPreference] =
    useState<NotificationPreference>("daily_digest");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function addKeyword() {
    const value = keywordInput.trim();
    if (!value || keywords.includes(value)) return;
    setKeywords([...keywords, value]);
    setKeywordInput("");
    if (!projectName) setProjectName(value);
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
      projectName: projectName || keywords[0] || "My monitoring",
    };
    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
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
        Step {step} of {TOTAL_STEPS}
      </p>

      {step === 1 ? (
        <StepShell title="What do you want to track?">
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
                {target.label}
              </button>
            ))}
          </div>
        </StepShell>
      ) : null}

      {step === 2 ? (
        <StepShell title="Add keywords to track">
          <div className="flex gap-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addKeyword();
                }
              }}
              placeholder="e.g. your company name"
              aria-label="Keyword"
            />
            <Button type="button" variant="secondary" onClick={addKeyword}>
              Add
            </Button>
          </div>
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
                    aria-label={`Remove ${keyword}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Try your company name, a product, or an executive&apos;s name.
            </p>
          )}
        </StepShell>
      ) : null}

      {step === 3 ? (
        <StepShell title="Choose sources">
          <div className="grid grid-cols-2 gap-3">
            {SOURCE_TYPES.map((source) => (
              <label key={source.value} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={sourceTypes.includes(source.value)}
                  onCheckedChange={() => toggleSourceType(source.value)}
                />
                {source.label}
              </label>
            ))}
          </div>
        </StepShell>
      ) : null}

      {step === 4 ? (
        <StepShell title="How should we notify you?">
          <div className="flex flex-col gap-2">
            {NOTIFICATION_PREFERENCES.map((pref) => (
              <label
                key={pref.value}
                className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 ${
                  notificationPreference === pref.value ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="notificationPreference"
                  className="mt-1"
                  checked={notificationPreference === pref.value}
                  onChange={() => setNotificationPreference(pref.value)}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{pref.label}</span>
                  <span className="block text-sm text-muted-foreground">{pref.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </StepShell>
      ) : null}

      {step === 5 ? (
        <StepShell title="Name this project">
          <Field id="projectName" label="Project name" required>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          </Field>
          <p className="mt-3 text-sm text-muted-foreground">
            Tracking {keywords.length} keyword{keywords.length === 1 ? "" : "s"} across{" "}
            {sourceTypes.length} source type{sourceTypes.length === 1 ? "" : "s"}.
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
          Back
        </Button>
        {step < TOTAL_STEPS ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>
            Continue
          </Button>
        ) : (
          <Button type="button" onClick={finish} disabled={isSubmitting}>
            {isSubmitting ? "Setting up…" : "Go to dashboard"}
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
