import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth-card";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import { VerifyEmailClient } from "./verify-email-client";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage() {
  const t = await getTranslations("auth.verify");
  return (
    <AuthCard title={t("title")}>
      <Suspense fallback={null}>
        <VerifyEmailClient turnstileSiteKey={getTurnstileSiteKey()} />
      </Suspense>
    </AuthCard>
  );
}
