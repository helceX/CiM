import { getTranslations } from "next-intl/server";
import { Mail } from "lucide-react";
import { GlowCard } from "@/components/marketing/glow-card";
import { IconTile } from "@/components/marketing/icon-tile";
import { PageHero } from "@/components/marketing/sections";

export default async function ContactPage() {
  const t = await getTranslations("contact");
  return (
    <>
      <PageHero
        eyebrow={t("hero.eyebrow")}
        title={t("hero.title")}
        accent={t("hero.titleAccent")}
        lead={t("hero.lead")}
      />
      <section className="mk-section pb-28 pt-6">
        <div className="mk-wrap max-w-xl">
          <GlowCard className="p-8 text-center">
            <div className="flex justify-center">
              <IconTile icon={Mail} tone="magenta" />
            </div>
            <h2 className="mt-6 text-2xl font-semibold">{t("card.title")}</h2>
            <p className="mt-2 text-[var(--mk-muted)]">{t("card.body")}</p>
            <a
              href="mailto:hello@mediaory.io"
              className="mk-gradient-text mt-6 inline-block text-2xl font-semibold underline decoration-white/30 underline-offset-8"
            >
              hello@mediaory.io
            </a>
            <p className="mt-6 text-xs text-[var(--mk-muted)]">{t("card.note")}</p>
          </GlowCard>
        </div>
      </section>
    </>
  );
}
