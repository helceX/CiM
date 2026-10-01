import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";
import { PageHero } from "@/components/marketing/sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.bot");
  return { title: `${t("title")} ${t("accent")}` };
}

export default async function BotPage() {
  const t = await getTranslations("legal");
  return (
    <>
      <PageHero eyebrow={t("bot.eyebrow")} title={t("bot.title")} accent={t("bot.accent")} lead={t("bot.lead")} />
      <LegalDocument sections={t.raw("bot.sections") as LegalSection[]} updated={t("updated")} />
      <div className="mk-wrap max-w-3xl pb-24">
        <Link href="/takedown" className="mk-btn mk-btn-primary">
          {t("bot.cta")}
        </Link>
      </div>
    </>
  );
}
