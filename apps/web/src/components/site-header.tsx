import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, Wordmark } from "@cim/ui";

const NAV_LINKS = [
  { href: "/features", key: "features" },
  { href: "/solutions", key: "solutions" },
  { href: "/security", key: "security" },
  { href: "/resources", key: "resources" },
  { href: "/pricing", key: "pricing" },
] as const;

export async function SiteHeader() {
  const t = await getTranslations("nav");
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" aria-label={t("home")} className="text-sm text-foreground">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">{t("signIn")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">{t("getStarted")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
