"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@cim/ui";

export function ResetPasswordForm() {
  const t = useTranslations("auth.reset");
  const common = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError(t("missingToken"));
      return;
    }
    setError(null);
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: String(formData.get("password") ?? "") }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? common("generic"));
        return;
      }
      router.push("/login");
    } catch {
      setError(common("generic"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field
        id="password"
        label={t("password")}
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
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
