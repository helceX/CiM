"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@cim/ui";
import { TurnstileWidget } from "@/components/turnstile-widget";

export function ResendVerificationForm({
  defaultEmail = "",
  turnstileSiteKey = null,
}: {
  defaultEmail?: string;
  turnstileSiteKey?: string | null;
}) {
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
      setMessage(data.error ?? "Something went wrong. Please try again.");
      setStatus("error");
      setCaptchaReset((n) => n + 1);
    } catch {
      setMessage("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <p role="status" className="text-sm text-foreground">
        If that address has an unverified account, a new verification link is on its way. Check your
        spam folder too.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <Field id="resend-email" label="Email" required>
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
        {status === "sending" ? "Sending…" : "Resend verification email"}
      </Button>
    </form>
  );
}
