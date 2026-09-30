"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input } from "@cim/ui";

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    try {
      await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(formData.get("email") ?? "") }),
      });
    } finally {
      setSubmitted(true);
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
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
