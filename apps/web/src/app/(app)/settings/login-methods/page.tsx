import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db, listLoginIdentities } from "@cim/db";
import { getCurrentUser } from "@/lib/session";
import { FederatedLoginOptions } from "@/components/federated-login-options";

export default async function LoginMethodsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("auth.federated");
  const identities = await listLoginIdentities(db, user.id);
  return <section className="max-w-xl rounded-xl border border-border bg-card p-5"><h1 className="mb-4 text-xl font-semibold">{t("title")}</h1><FederatedLoginOptions link linked={identities.map(identity => identity.provider)} /></section>;
}
