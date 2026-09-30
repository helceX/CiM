import { getTranslations } from "next-intl/server";
import { DatabaseZap, FileCheck2, KeyRound, Lock } from "lucide-react";
import { GlowCard } from "@/components/marketing/glow-card";
import { IconTile } from "@/components/marketing/icon-tile";
import { Reveal } from "@/components/marketing/reveal";
import { CtaBand, PageHero } from "@/components/marketing/sections";

const PILLARS = [
  { key: "tenancy", icon: Lock, tone: "violet" },
  { key: "rights", icon: FileCheck2, tone: "cyan" },
  { key: "control", icon: DatabaseZap, tone: "coral" },
  { key: "secure", icon: KeyRound, tone: "magenta" },
] as const;

export default async function SecurityPage() {
  const t = await getTranslations("security");
  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        accent={t("hero.titleAccent")}
        lead={t("hero.lead")}
      />
      <section className="mk-section pt-10">
        <ul className="mk-wrap grid gap-5 md:grid-cols-2">
          {PILLARS.map((pillar, index) => (
            <Reveal as="li" key={pillar.key} delay={(index % 2) * 90}>
              <GlowCard className="h-full p-8">
                <IconTile icon={pillar.icon} tone={pillar.tone} />
                <h2 className="mt-6 text-3xl font-extrabold">{t(`pillars.${pillar.key}.title`)}</h2>
                <p className="mt-3 text-[var(--mk-muted)]">{t(`pillars.${pillar.key}.body`)}</p>
              </GlowCard>
            </Reveal>
          ))}
        </ul>
      </section>
      <CtaBand title={t("cta.title")} body={t("cta.body")} primary={t("cta.primary")} primaryHref="/contact" />
    </>
  );
}
