"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@cim/ui";

export function ResendVerificationForm({ defaultEmail = "" }: { defaultEmail?: string }) {
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
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setStatus("sent");
        return;
      }
      const data = await response.json().catch(() => ({}));
      setMessage(data.error ?? "Something went wrong. Please try again.");
      setStatus("error");
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
      <Button type="submit" variant="secondary" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Resend verification email"}
      </Button>
    </form>
  );
}
