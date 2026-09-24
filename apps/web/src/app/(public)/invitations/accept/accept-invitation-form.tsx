"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@cim/ui";

export function AcceptInvitationForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
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
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <Field id="email" label="Email">
        <Input value={email} disabled readOnly />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="firstName" label="First name" required>
          <Input name="firstName" autoComplete="given-name" required />
        </Field>
        <Field id="lastName" label="Last name" required>
          <Input name="lastName" autoComplete="family-name" required />
        </Field>
      </div>
      <Field
        id="password"
        label="Password"
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
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Setting up…" : "Accept invitation"}
      </Button>
    </form>
  );
}
