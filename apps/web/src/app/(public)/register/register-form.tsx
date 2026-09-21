"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Button, Field, Input } from "@cim/ui";

export function RegisterForm() {
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
            if (key) next[key] = issue.message;
          }
          setFieldErrors(next);
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-foreground">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to your inbox. Click it to activate your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <Field id="firstName" label="First name" error={fieldErrors.firstName} required>
          <Input name="firstName" autoComplete="given-name" required />
        </Field>
        <Field id="lastName" label="Last name" error={fieldErrors.lastName} required>
          <Input name="lastName" autoComplete="family-name" required />
        </Field>
      </div>
      <Field id="email" label="Work email" error={fieldErrors.email} required>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field id="companyName" label="Company name" error={fieldErrors.companyName} required>
        <Input name="companyName" autoComplete="organization" required />
      </Field>
      <Field id="jobTitle" label="Position" error={fieldErrors.jobTitle} required>
        <Input name="jobTitle" required />
      </Field>
      <Field
        id="password"
        label="Password"
        error={fieldErrors.password}
        hint="At least 10 characters, with upper and lower case letters and a number."
        required
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
