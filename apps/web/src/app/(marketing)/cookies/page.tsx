import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";
import { PageHero } from "@/components/marketing/sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.cookies");
  return { title: `${t("title")} ${t("accent")} — Mediaory` };
}

export default async function CookiesPage() {
  const t = await getTranslations("legal.cookies");
  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} accent={t("accent")} lead={t("lead")} />
      <LegalDocument sections={t.raw("sections") as LegalSection[]} updated={t("updated")} />
    </>
  );
}
