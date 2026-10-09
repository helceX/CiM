import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument, type LegalSection } from "@/components/marketing/legal-document";
import { PageHero } from "@/components/marketing/sections";
import { entityLines, getLegalEntity } from "@/lib/legal-entity";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  return { title: `${t("title")} ${t("accent")} — Mediaory` };
}

export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");

  // Section 1 is the data controller (KVKK Art. 10): the identity details come from the operator's
  // configuration, and any that are not set are left out rather than shown as placeholders.
  const identity: LegalSection = {
    title: t("controller.title"),
    body: [t("controller.intro")],
    items: entityLines(getLegalEntity(), (key, values) => t(`controller.${key}`, values)),
    after: [t("controller.customers")],
  };

  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} accent={t("accent")} lead={t("lead")} />
      <LegalDocument sections={[identity, ...(t.raw("sections") as LegalSection[])]} updated={t("updated")} />
    </>
  );
}
