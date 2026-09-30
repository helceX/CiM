"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field, Input } from "@cim/ui";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "UNVERIFIED") setNeedsVerification(true);
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      const next = searchParams.get("next") ?? "/dashboard";
      router.push(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field id="email" label="Email" required>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field id="password" label="Password" required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
          {needsVerification ? (
            <>
              {" "}
              <Link href="/verify-email" className="underline underline-offset-2">
                Resend verification email
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Link href="/forgot-password" className="text-sm text-primary underline underline-offset-2">
          Forgot password?
        </Link>
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-primary underline underline-offset-2">
          Create one
        </Link>
      </p>
    </form>
  );
}
