"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@cim/ui";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { useLocalizedIssue } from "@/lib/use-localized-issue";

export function RegisterForm({ turnstileSiteKey = null }: { turnstileSiteKey?: string | null }) {
  const t = useTranslations("auth.register");
  const common = useTranslations("auth");
  const legal = useTranslations("legal.forms");
  const localizeIssue = useLocalizedIssue();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      companyName: String(formData.get("companyName") ?? ""),
      jobTitle: String(formData.get("jobTitle") ?? ""),
      password: String(formData.get("password") ?? ""),
      turnstileToken: captchaToken ?? undefined,
    };

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data.issues)) {
          const next: Record<string, string> = {};
          for (const issue of data.issues) {
            const key = issue.path?.[0];
            if (key) next[key] = localizeIssue(issue.message);
          }
          setFieldErrors(next);
        } else {
          setError(data.error ?? common("generic"));
        }
        return;
      }
      setSubmitted(true);
    } catch {
      setError(common("generic"));
    } finally {
      setCaptchaReset((n) => n + 1);
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-foreground">{t("checkEmail")}</p>
        <p className="text-sm text-muted-foreground">
          {t("checkEmailBody")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("noMail")}{" "}
          <Link href="/verify-email" className="text-primary underline underline-offset-2">
            {t("sendAgain")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <Field id="firstName" label={t("firstName")} error={fieldErrors.firstName} required>
          <Input name="firstName" autoComplete="given-name" required />
        </Field>
        <Field id="lastName" label={t("lastName")} error={fieldErrors.lastName} required>
          <Input name="lastName" autoComplete="family-name" required />
        </Field>
      </div>
      <Field id="email" label={t("email")} error={fieldErrors.email} required>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field id="companyName" label={t("company")} error={fieldErrors.companyName} required>
        <Input name="companyName" autoComplete="organization" required />
      </Field>
      <Field id="jobTitle" label={t("position")} error={fieldErrors.jobTitle} required>
        <Input name="jobTitle" required />
      </Field>
      <Field
        id="password"
        label={t("password")}
        error={fieldErrors.password}
        hint={t("passwordHint")}
        required
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <TurnstileWidget siteKey={turnstileSiteKey} onToken={setCaptchaToken} resetKey={captchaReset} />

      <p className="text-xs text-muted-foreground">
        {legal.rich("accountNotice", {
          terms: (chunks) => (
            <Link href="/terms" className="text-primary underline underline-offset-2">
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link href="/privacy" className="text-primary underline underline-offset-2">
              {chunks}
            </Link>
          ),
        })}
      </p>

      <Button
        type="submit"
        disabled={isSubmitting || (turnstileSiteKey !== null && !captchaToken)}
        className="mt-2"
      >
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-primary underline underline-offset-2">
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}
