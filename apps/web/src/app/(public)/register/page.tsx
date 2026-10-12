import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth-card";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import { RegisterForm } from "./register-form";
import { cookies } from "next/headers";
import { getEnv } from "@cim/config";
import { openLoginValue, PENDING_COOKIE, type LoginIdentity } from "@/lib/federated-login";
import { FederatedLoginOptions } from "@/components/federated-login-options";
import { sealBlogAttribution, validBlogSource } from "@/lib/blog-attribution";

// Read per request: the Turnstile key comes from runtime environment variables.
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ federated?: string; blog?: string }> }) {
  const t = await getTranslations("auth.register");
  const query = await searchParams;
  const requested = query.federated === "1";
  const identity = requested ? openLoginValue<LoginIdentity & { expires: number }>((await cookies()).get(PENDING_COOKIE)?.value, getEnv().SESSION_SECRET) : null;
  const candidate = identity?.blogSource ?? query.blog;
  const blogSource = validBlogSource(candidate);
  const attribution = blogSource ? sealBlogAttribution(blogSource, getEnv().SESSION_SECRET) : null;
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      {!identity ? <FederatedLoginOptions blogSource={blogSource} /> : null}
      <RegisterForm attribution={attribution} turnstileSiteKey={getTurnstileSiteKey()} federated={identity ? { email: identity.email, name: identity.name } : null} />
    </AuthCard>
  );
}
