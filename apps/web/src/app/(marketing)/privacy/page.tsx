import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";
import { PageHero } from "@/components/marketing/sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  return { title: `${t("title")} ${t("accent")} — Mediaory` };
}

export default async function PrivacyPage() {
  const t = await getTranslations("legal");
  return (
    <>
      <PageHero
        eyebrow={t("privacy.eyebrow")}
        title={t("privacy.title")}
        accent={t("privacy.accent")}
        lead={t("privacy.lead")}
      />
      <LegalDocument sections={t.raw("privacy.sections") as LegalSection[]} updated={t("updated")} />
    </>
  );
}
