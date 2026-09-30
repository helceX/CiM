import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { MarketingHeader } from "@/components/marketing/site-header";
import { MarketingFooter } from "@/components/marketing/site-footer";
import "../marketing.css";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("nav");
  return (
    <div className="mk flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
      >
        {t("skip")}
      </a>
      <MarketingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
