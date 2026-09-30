import { getTranslations } from "next-intl/server";
import { Coins, Hash, Rocket } from "lucide-react";
import { GlowCard } from "@/components/marketing/glow-card";
import { IconTile } from "@/components/marketing/icon-tile";
import { Reveal } from "@/components/marketing/reveal";
import { CtaBand, PageHero } from "@/components/marketing/sections";

const IDEAS = [
  { key: "credits", icon: Coins, tone: "violet" },
  { key: "keywords", icon: Hash, tone: "magenta" },
  { key: "free", icon: Rocket, tone: "coral" },
] as const;

export default async function PricingPage() {
  const t = await getTranslations("pricing");
  const common = await getTranslations("common");
  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        accent={t("hero.titleAccent")}
        lead={t("hero.lead")}
      >
        <span className="mk-chip mk-chip-soon">{common("comingSoon")}</span>
      </PageHero>
      <section className="mk-section pt-10">
        <div className="mk-wrap">
          <h2 className="sr-only">{t("idea.title")}</h2>
          <ul className="grid gap-5 md:grid-cols-3">
            {IDEAS.map((idea, index) => (
              <Reveal as="li" key={idea.key} delay={index * 90}>
                <GlowCard className="h-full p-8">
                  <IconTile icon={idea.icon} tone={idea.tone} />
                  <h3 className="mt-6 text-xl font-semibold">{t(`idea.items.${idea.key}.title`)}</h3>
                  <p className="mt-3 text-[var(--mk-muted)]">{t(`idea.items.${idea.key}.body`)}</p>
                </GlowCard>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>
      <CtaBand
        title={t("cta.title")}
        body={t("cta.body")}
        primary={t("cta.primary")}
        primaryHref="/contact"
        secondary={t("cta.secondary")}
        secondaryHref="/register"
      />
    </>
  );
}
