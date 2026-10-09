"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@cim/ui";

export function LoginForm() {
  const t = useTranslations("auth.signIn");
  const common = useTranslations("auth");
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
        setError(data.error ?? common("generic"));
        return;
      }
      const next = searchParams.get("next") ?? "/dashboard";
      router.push(next);
      router.refresh();
    } catch {
      setError(common("generic"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field id="email" label={t("email")} required>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field id="password" label={t("password")} required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
          {needsVerification ? (
            <>
              {" "}
              <Link href="/verify-email" className="underline underline-offset-2">
                {t("resendVerification")}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Link href="/forgot-password" className="text-sm text-primary underline underline-offset-2">
          {t("forgot")}
        </Link>
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/register" className="text-primary underline underline-offset-2">
          {t("create")}
        </Link>
      </p>
    </form>
  );
}
