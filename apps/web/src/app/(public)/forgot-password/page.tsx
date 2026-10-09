import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth-card";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <ForgotPasswordForm turnstileSiteKey={getTurnstileSiteKey()} />
    </AuthCard>
  );
}
