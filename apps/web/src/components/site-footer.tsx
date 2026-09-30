import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>&copy; {new Date().getFullYear()} Mediaory. {t("rights")}</p>
        <nav className="flex gap-5" aria-label="Footer">
          <Link href="/security" className="hover:text-foreground">
            {t("security")}
          </Link>
          <Link href="/resources" className="hover:text-foreground">
            {t("resources")}
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            {t("contact")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
