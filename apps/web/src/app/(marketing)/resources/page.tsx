import { getTranslations } from "next-intl/server";
import { BookOpenText, Braces, Webhook } from "lucide-react";
import { GlowCard } from "@/components/marketing/glow-card";
import { IconTile } from "@/components/marketing/icon-tile";
import { Reveal } from "@/components/marketing/reveal";
import { CtaBand, PageHero } from "@/components/marketing/sections";

export default async function ResourcesPage() {
  const t = await getTranslations("resources");
  const home = await getTranslations("home.cta");
  const common = await getTranslations("common");
  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        accent={t("hero.titleAccent")}
        lead={t("hero.lead")}
      />
      <section className="mk-section pt-10">
        <ul className="mk-wrap grid gap-5 md:grid-cols-3">
          {(
            [
              { key: "start", icon: BookOpenText, tone: "violet" },
              { key: "syntax", icon: Braces, tone: "magenta" },
              { key: "api", icon: Webhook, tone: "coral" },
            ] as const
          ).map((item, index) => (
            <Reveal as="li" key={item.key} delay={index * 90}>
              <GlowCard className="h-full p-8">
                <div className="flex items-center justify-between">
                  <IconTile icon={item.icon} tone={item.tone} />
                  {item.key === "api" ? <span className="mk-chip mk-chip-soon">{common("comingSoon")}</span> : null}
                </div>
                <h2 className="mt-6 text-xl font-semibold">{t(`items.${item.key}.title`)}</h2>
                <p className="mt-3 text-[var(--mk-muted)]">{t(`items.${item.key}.body`)}</p>
              </GlowCard>
            </Reveal>
          ))}
        </ul>
      </section>
      <CtaBand title={home("title")} body={home("body")} primary={home("primary")} secondary={home("secondary")} />
    </>
  );
}
