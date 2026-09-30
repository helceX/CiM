import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/marketing/reveal";
import { CtaBand, FeatureRow, PageHero, SectionHead } from "@/components/marketing/sections";
import { GlowCard } from "@/components/marketing/glow-card";

const ROWS = [
  { key: "monitoring", src: "/mockups/monitoring-new.webp" },
  { key: "dedupe", src: "/mockups/mentions.webp" },
  { key: "ai", src: "/mockups/mention-drawer.webp" },
  { key: "alerts", src: "/mockups/alerts-new.webp" },
  { key: "analytics", src: "/mockups/analytics.webp" },
  { key: "reports", src: "/mockups/reports-new.webp" },
] as const;

export default async function FeaturesPage() {
  const t = await getTranslations("features");
  const home = await getTranslations("home.cta");
  const more = t.raw("more.items") as { title: string; body: string }[];

  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        accent={t("hero.titleAccent")}
        lead={t("hero.lead")}
      />
      <section className="mk-section pt-10">
        <div className="mk-wrap flex flex-col gap-28">
          {ROWS.map((row, index) => (
            <FeatureRow
              key={row.key}
              index={index}
              title={t(`rows.${row.key}.title`)}
              body={t(`rows.${row.key}.body`)}
              points={t.raw(`rows.${row.key}.points`) as string[]}
              src={row.src}
              alt={t(`rows.${row.key}.alt`)}
            />
          ))}
        </div>
      </section>
      <section className="mk-section pt-0">
        <div className="mk-wrap">
          <SectionHead title={t("more.title")} />
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((item, index) => (
              <Reveal as="li" key={item.title} delay={(index % 3) * 80}>
                <GlowCard className="h-full p-6">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-[var(--mk-muted)]">{item.body}</p>
                </GlowCard>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>
      <CtaBand title={home("title")} body={home("body")} primary={home("primary")} secondary={home("secondary")} />
    </>
  );
}
