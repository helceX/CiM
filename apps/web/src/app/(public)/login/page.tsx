import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "./login-form";
import { FederatedLoginOptions } from "@/components/federated-login-options";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const t = await getTranslations("auth.signIn");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <FederatedLoginOptions />
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
