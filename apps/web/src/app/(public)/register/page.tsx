import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth-card";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import { RegisterForm } from "./register-form";

// Read per request: the Turnstile key comes from runtime environment variables.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const t = await getTranslations("auth.register");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <RegisterForm turnstileSiteKey={getTurnstileSiteKey()} />
    </AuthCard>
  );
}
