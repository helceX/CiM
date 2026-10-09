"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@cim/ui";
import { TurnstileWidget } from "@/components/turnstile-widget";

export function ResendVerificationForm({
  defaultEmail = "",
  turnstileSiteKey = null,
}: {
  defaultEmail?: string;
  turnstileSiteKey?: string | null;
}) {
  const t = useTranslations("auth.verify");
  const common = useTranslations("auth");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage(null);
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: captchaToken ?? undefined }),
      });
      if (response.ok) {
        setStatus("sent");
        return;
      }
      const data = await response.json().catch(() => ({}));
      setMessage(data.error ?? common("generic"));
      setStatus("error");
      setCaptchaReset((n) => n + 1);
    } catch {
      setMessage(common("generic"));
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <p role="status" className="text-sm text-foreground">
        {t("sent")}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <Field id="resend-email" label={t("email")} required>
        <Input name="email" type="email" autoComplete="email" defaultValue={defaultEmail} required />
      </Field>
      {status === "error" && message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
      <TurnstileWidget siteKey={turnstileSiteKey} onToken={setCaptchaToken} resetKey={captchaReset} />
      <Button
        type="submit"
        variant="secondary"
        disabled={status === "sending" || (turnstileSiteKey !== null && !captchaToken)}
      >
        {status === "sending" ? t("sending") : t("resend")}
      </Button>
    </form>
  );
}
