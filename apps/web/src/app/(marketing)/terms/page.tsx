import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";
import { PageHero } from "@/components/marketing/sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.terms");
  return { title: `${t("title")} ${t("accent")} — Mediaory` };
}

export default async function TermsPage() {
  const t = await getTranslations("legal");
  return (
    <>
      <PageHero
        eyebrow={t("terms.eyebrow")}
        title={t("terms.title")}
        accent={t("terms.accent")}
        lead={t("terms.lead")}
      />
      <LegalDocument sections={t.raw("terms.sections") as LegalSection[]} updated={t("updated")} />
    </>
  );
}
