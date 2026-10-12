import { getTranslations } from "next-intl/server";
import { configuredLoginProviders, LOGIN_PROVIDERS, type LoginProvider } from "@/lib/federated-login";

const labels: Record<LoginProvider, string> = { google: "Google", github: "GitHub", microsoft: "Microsoft" };
export async function FederatedLoginOptions({ link = false, linked = [] }: { link?: boolean; linked?: string[] }) {
  const t = await getTranslations("auth.federated");
  const configured = configuredLoginProviders();
  return <section aria-label={t("title")} className="mb-5 flex flex-col gap-2">
    <p className="text-sm text-muted-foreground">{t(link ? "linkHelp" : "help")}</p>
    {LOGIN_PROVIDERS.map(provider => linked.includes(provider) ? <p key={provider} className="text-sm">{labels[provider]} · {t("connected")}</p>
      : configured.includes(provider) ? <a key={provider} className="rounded-md border border-border px-4 py-2 text-center text-sm font-medium" href={`/api/auth/federated/${provider}/start${link ? "?mode=link" : ""}`}>{t(link ? "link" : "continue", { provider: labels[provider] })}</a>
      : <button key={provider} disabled className="rounded-md border border-border px-4 py-2 text-sm opacity-50">{labels[provider]} · {t("notConfigured")}</button>)}
  </section>;
}
