import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@cim/ui";

export async function MarketingFooter() {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");
  const legal = await getTranslations("legal");
  const columns = [
    {
      title: t("product"),
      links: [
        { href: "/features", label: nav("features") },
        { href: "/solutions", label: nav("solutions") },
        { href: "/pricing", label: nav("pricing") },
      ],
    },
    {
      title: t("trust"),
      links: [
        { href: "/security", label: nav("security") },
        { href: "/resources", label: nav("resources") },
        { href: "/contact", label: t("contact") },
        { href: "/terms", label: legal("footerTerms") },
        { href: "/privacy", label: legal("footerPrivacy") },
        { href: "/bot", label: legal("footerBot") },
      ],
    },
    {
      title: t("account"),
      links: [
        { href: "/login", label: nav("signIn") },
        { href: "/register", label: nav("getStarted") },
      ],
    },
  ];
  return (
    <footer className="relative border-t border-[var(--mk-line)] bg-[var(--mk-ink)]/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-4">
          <Wordmark surface="dark" />
          <p className="max-w-xs text-sm text-[var(--mk-muted)]">{t("tagline")}</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="text-sm font-semibold text-white">{column.title}</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-[var(--mk-muted)] transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-[var(--mk-line)]">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-[var(--mk-muted)]">
          &copy; {new Date().getFullYear()} Mediaory. {t("rights")}
        </p>
      </div>
    </footer>
  );
}
