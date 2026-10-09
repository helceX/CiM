"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Field, Input } from "@cim/ui";

export function AcceptInvitationForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const t = useTranslations("auth.invitation");
  const common = useTranslations("auth");
  const legal = useTranslations("legal.forms");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName: String(formData.get("firstName") ?? ""),
          lastName: String(formData.get("lastName") ?? ""),
          password: String(formData.get("password") ?? ""),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? common("generic"));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(common("generic"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field id="email" label={t("email")}>
        <Input value={email} disabled readOnly />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="firstName" label={t("firstName")} required>
          <Input name="firstName" autoComplete="given-name" required />
        </Field>
        <Field id="lastName" label={t("lastName")} required>
          <Input name="lastName" autoComplete="family-name" required />
        </Field>
      </div>
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
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
