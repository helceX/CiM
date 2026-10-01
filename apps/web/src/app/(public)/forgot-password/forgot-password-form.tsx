"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@cim/ui";
import { TurnstileWidget } from "@/components/turnstile-widget";

export function ForgotPasswordForm({ turnstileSiteKey = null }: { turnstileSiteKey?: string | null }) {
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(formData.get("email") ?? ""),
          turnstileToken: captchaToken ?? undefined,
        }),
      });
      // Always the same confirmation (no account enumeration) — except when the
      // human check itself failed, where claiming "we sent it" would be false.
      const data = await response.json().catch(() => ({}));
      if (data?.code === "captcha_failed") {
        setError(data.error);
        setCaptchaReset((n) => n + 1);
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        If an account exists for that email, we sent a password reset link.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field id="email" label="Email" required>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <TurnstileWidget siteKey={turnstileSiteKey} onToken={setCaptchaToken} resetKey={captchaReset} />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={isSubmitting || (turnstileSiteKey !== null && !captchaToken)}>
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
