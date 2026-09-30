import { getTranslations } from "next-intl/server";
import { Building2, Megaphone, Siren, Store } from "lucide-react";
import { GlowCard } from "@/components/marketing/glow-card";
import { IconTile } from "@/components/marketing/icon-tile";
import { Reveal } from "@/components/marketing/reveal";
import { CtaBand, PageHero } from "@/components/marketing/sections";

const PERSONAS = [
  { key: "comms", icon: Building2, tone: "violet" },
  { key: "pr", icon: Megaphone, tone: "magenta" },
  { key: "brand", icon: Store, tone: "coral" },
  { key: "crisis", icon: Siren, tone: "cyan" },
] as const;

export default async function SolutionsPage() {
  const t = await getTranslations("solutions");
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
          {PERSONAS.map((persona, index) => (
            <Reveal as="li" key={persona.key} delay={(index % 2) * 90}>
              <GlowCard className="h-full p-8">
                <IconTile icon={persona.icon} tone={persona.tone} />
                <h2 className="mt-6 text-2xl font-semibold">{t(`personas.${persona.key}.title`)}</h2>
                <p className="mt-3 text-[var(--mk-muted)]">{t(`personas.${persona.key}.body`)}</p>
                <ul className="mt-6 flex flex-col gap-2.5">
                  {(t.raw(`personas.${persona.key}.points`) as string[]).map((point) => (
                    <li key={point} className="flex items-start gap-3 text-sm text-zinc-200">
                      <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--mk-magenta)]" />
                      {point}
                    </li>
                  ))}
                </ul>
              </GlowCard>
            </Reveal>
          ))}
        </ul>
      </section>
      <CtaBand title={t("cta.title")} body={t("cta.body")} primary={t("cta.primary")} primaryHref="/contact" secondary={t("cta.secondary")} secondaryHref="/register" />
    </>
  );
}
