"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TurnstileWidget } from "@/components/turnstile-widget";

const field =
  "w-full rounded-lg border border-[var(--mk-line)] bg-white/5 px-3 py-2.5 text-base text-white placeholder:text-[var(--mk-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mk-cyan)]";

export function TakedownForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const t = useTranslations("legal.takedown");
  const forms = useTranslations("legal.forms");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [requestId, setRequestId] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus("sending");
    setError(null);
    try {
      const response = await fetch("/api/takedown", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requesterName: String(data.get("requesterName") ?? ""),
          requesterEmail: String(data.get("requesterEmail") ?? ""),
          publisher: String(data.get("publisher") ?? ""),
          targets: String(data.get("targets") ?? ""),
          message: String(data.get("message") ?? ""),
          confirmAuthority: data.get("confirmAuthority") === "on",
          turnstileToken: captchaToken ?? undefined,
        }),
      });
      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as { requestId?: string };
        setRequestId(body.requestId ?? null);
        setStatus("done");
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? t("error"));
      setStatus("error");
    } catch {
      setError(t("error"));
      setStatus("error");
    }
    setCaptchaReset((n) => n + 1);
  }

  if (status === "done") {
    return (
      <div role="status" className="rounded-2xl border border-[var(--mk-line)] bg-white/5 p-8">
        <h2 className="text-2xl font-extrabold">{t("doneTitle")}</h2>
        <p className="mt-3 text-[var(--mk-muted)]">{t("doneBody")}</p>
        {requestId ? (
          <p className="mt-3 text-sm text-[var(--mk-muted)]">
            {t("requestId", { id: requestId })}{" "}
            <Link href={`/takedown/status/${requestId}`} className="underline underline-offset-2 hover:text-white">
              {t("checkStatus")}
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  const label = "mb-1.5 block text-sm font-semibold text-white";
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="requesterName" className={label}>{t("name")}</label>
        <input id="requesterName" name="requesterName" autoComplete="name" required maxLength={120} className={field} />
      </div>
      <div>
        <label htmlFor="requesterEmail" className={label}>{t("email")}</label>
        <input id="requesterEmail" name="requesterEmail" type="email" autoComplete="email" required className={field} />
      </div>
      <div>
        <label htmlFor="publisher" className={label}>{t("publisher")}</label>
        <input id="publisher" name="publisher" required maxLength={200} className={field} />
      </div>
      <div>
        <label htmlFor="targets" className={label}>{t("targets")}</label>
        <textarea id="targets" name="targets" required rows={3} maxLength={1000} aria-describedby="targets-hint" className={field} />
        <p id="targets-hint" className="mt-1.5 text-sm text-[var(--mk-muted)]">{t("targetsHint")}</p>
      </div>
      <div>
        <label htmlFor="message" className={label}>{t("message")}</label>
        <textarea id="message" name="message" rows={4} maxLength={2000} className={field} />
      </div>
      <label className="flex items-start gap-3 text-sm text-white">
        <input type="checkbox" name="confirmAuthority" required className="mt-1 size-4" />
        <span>{t("authority")}</span>
      </label>

      <TurnstileWidget siteKey={turnstileSiteKey} onToken={setCaptchaToken} resetKey={captchaReset} />

      {error ? (
        <p role="alert" className="text-sm font-semibold text-[var(--mk-coral)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="mk-btn mk-btn-primary self-start"
        disabled={status === "sending" || (turnstileSiteKey !== null && !captchaToken)}
      >
        {status === "sending" ? t("sending") : t("submit")}
      </button>
      <p className="text-sm text-[var(--mk-muted)]">
        {forms.rich("takedownNotice", {
          privacy: (chunks) => (
            <Link href="/privacy" className="underline underline-offset-2 hover:text-white">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </form>
  );
}
