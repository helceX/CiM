import { getTranslations } from "next-intl/server";
import { HeaderBar } from "./header-bar";

const LINKS = [
  { href: "/features", key: "features" },
  { href: "/solutions", key: "solutions" },
  { href: "/security", key: "security" },
  { href: "/resources", key: "resources" },
  { href: "/pricing", key: "pricing" },
] as const;

export async function MarketingHeader() {
  const t = await getTranslations("nav");
  return (
    <HeaderBar
      links={LINKS.map((link) => ({ href: link.href, label: t(link.key) }))}
      signIn={t("signIn")}
      getStarted={t("getStarted")}
      homeLabel={t("home")}
      menuLabel={t("openMenu")}
      closeLabel={t("closeMenu")}
    />
  );
}
