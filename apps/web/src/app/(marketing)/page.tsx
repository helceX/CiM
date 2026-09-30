import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ArrowRight,
  BellRing,
  Compass,
  Gauge,
  LineChart,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Laptop, PhoneFeed } from "@/components/marketing/devices";
import { GlowCard } from "@/components/marketing/glow-card";
import { IconTile } from "@/components/marketing/icon-tile";
import { Marquee } from "@/components/marketing/marquee";
import { Reveal } from "@/components/marketing/reveal";
import { ScrollStory, type StoryStep } from "@/components/marketing/scroll-story";
import { ScrollTilt } from "@/components/marketing/scroll-tilt";
import { CtaBand, SectionHead } from "@/components/marketing/sections";

const STORY = [
  { id: "watch", src: "/mockups/monitoring-new.webp" },
  { id: "filter", src: "/mockups/mentions.webp" },
  { id: "understand", src: "/mockups/mention-drawer.webp" },
  { id: "alert", src: "/mockups/alerts-new.webp" },
  { id: "report", src: "/mockups/reports-new.webp" },
] as const;

export default async function LandingPage() {
  const t = await getTranslations("home");
  const common = await getTranslations("common");
  const stepsT = await getTranslations("home.story.steps");

  const steps: StoryStep[] = STORY.map(({ id, src }) => ({
    id,
    src,
    kicker: stepsT(`${id}.kicker`),
    title: stepsT(`${id}.title`),
    body: stepsT(`${id}.body`),
    alt: stepsT(`${id}.alt`),
  }));

  const sources = t.raw("sources.items") as string[];
  const soon = ["charts", "credits"] as const;
  const soonIcons = { charts: LineChart, credits: Gauge } as const;

  return (
    <>
      {/* HERO */}
      <section className="relative px-4 pb-8 pt-14 sm:pt-20">
        <div className="mk-wrap flex flex-col items-center text-center">
          <Reveal className="flex flex-col items-center gap-7">
            <span className="mk-eyebrow"><i aria-hidden="true" />{t("hero.eyebrow")}</span>
            <h1 className="max-w-5xl text-[clamp(2.9rem,8.4vw,6.25rem)] font-extrabold">
              {t("hero.titleA")}
              <br />
              <span className="mk-gradient-text">{t("hero.titleB")}</span>
            </h1>
            <p className="mk-lead max-w-2xl">{t("hero.subtitle")}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="mk-btn mk-btn-primary">
                {common("startMonitoring")} <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="#story" className="mk-btn mk-btn-ghost">
                {common("seeHowItWorks")}
              </Link>
            </div>
            <p className="text-sm text-[var(--mk-muted)]">{t("hero.note")}</p>
          </Reveal>
        </div>

        <div className="mk-wrap relative mt-12 max-w-5xl pb-6 sm:mt-14">
          <div aria-hidden="true" className="mk-spot mk-spot-violet left-[8%] top-[30%]" />
          <div aria-hidden="true" className="mk-spot mk-spot-magenta right-[4%] top-[46%]" />
          <ScrollTilt>
            <Laptop
              src="/mockups/dashboard.webp"
              alt={t("hero.screenAlt")}
              priority
              sizes="(min-width: 1024px) 960px, 94vw"
            />
          </ScrollTilt>

          <div
            aria-hidden="true"
            className="mk-chip absolute -left-1 top-[18%] hidden items-center gap-2 border-white/20 bg-[#141634]/80 px-4 py-2.5 text-sm text-white shadow-2xl backdrop-blur-md sm:inline-flex lg:-left-10"
          >
            <span className="size-2 rounded-full bg-emerald-400" /> {t("hero.chipMentions")}
          </div>
          <div
            aria-hidden="true"
            className="mk-chip absolute -right-1 bottom-[22%] hidden items-center gap-2 border-white/20 bg-[#141634]/80 px-4 py-2.5 text-sm text-white shadow-2xl backdrop-blur-md sm:inline-flex lg:-right-10"
          >
            <Sparkles className="size-4 text-fuchsia-300" /> {t("hero.chipAi")}
          </div>
        </div>
      </section>

      {/* SOURCES */}
      <section className="px-4 pb-6 pt-8" aria-label={t("sources.label")}>
        <div className="mk-wrap flex flex-col items-center gap-6">
          <p className="text-sm font-medium text-[var(--mk-muted)]">{t("sources.label")}</p>
          <div className="w-full">
            <Marquee items={sources} label={t("sources.label")} />
          </div>
        </div>
      </section>

      {/* SCROLL STORY */}
      <section id="story" className="mk-section scroll-mt-16">
        <div aria-hidden="true" className="mk-spot mk-spot-magenta right-[-10%] top-[30%]" />
        <div aria-hidden="true" className="mk-spot mk-spot-violet left-[-10%] top-[60%]" />
        <div className="mk-wrap">
          <SectionHead
            eyebrow={t("story.eyebrow")}
            title={t("story.title")}
            accent={t("story.titleAccent")}
            lead={t("story.lead")}
          />
          <div className="mt-16 lg:mt-24">
            <ScrollStory steps={steps} label={t("story.listLabel")} />
          </div>
        </div>
      </section>

      {/* WHY / BENTO */}
      <section className="mk-section">
        <div aria-hidden="true" className="mk-spot mk-spot-cyan left-[20%] top-[10%]" />
        <div aria-hidden="true" className="mk-spot mk-spot-coral right-[5%] bottom-[10%]" />
        <div className="mk-wrap">
          <SectionHead eyebrow={t("why.eyebrow")} title={t("why.title")} lead={t("why.lead")} />
          <div className="mt-14 grid gap-5 md:grid-cols-6">
            <Reveal className="md:col-span-4">
              <GlowCard className="h-full p-8">
                <IconTile icon={Sparkles} tone="violet" />
                <h3 className="mt-6 text-2xl font-semibold">{t("why.cards.grounded.title")}</h3>
                <p className="mt-3 max-w-lg text-[var(--mk-muted)]">{t("why.cards.grounded.body")}</p>
                <div className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-4" aria-hidden="true">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>{t("why.cards.grounded.meta")}</span>
                    <span className="font-semibold text-white">90%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[90%] rounded-full" style={{ background: "var(--mk-gradient)" }} />
                  </div>
                </div>
              </GlowCard>
            </Reveal>
            <Reveal className="md:col-span-2" delay={80}>
              <GlowCard className="h-full p-8">
                <IconTile icon={Compass} tone="cyan" />
                <h3 className="mt-6 text-2xl font-semibold">{t("why.cards.honest.title")}</h3>
                <p className="mt-3 text-[var(--mk-muted)]">{t("why.cards.honest.body")}</p>
                <span className="mk-chip mt-6" aria-hidden="true">{t("why.cards.honest.pill")}</span>
              </GlowCard>
            </Reveal>
            <Reveal className="md:col-span-2">
              <GlowCard className="h-full p-8">
                <IconTile icon={BellRing} tone="magenta" />
                <h3 className="mt-6 text-xl font-semibold">{t("why.cards.alerts.title")}</h3>
                <p className="mt-3 text-[var(--mk-muted)]">{t("why.cards.alerts.body")}</p>
              </GlowCard>
            </Reveal>
            <Reveal className="md:col-span-2" delay={80}>
              <GlowCard className="h-full p-8">
                <IconTile icon={Users} tone="coral" />
                <h3 className="mt-6 text-xl font-semibold">{t("why.cards.teams.title")}</h3>
                <p className="mt-3 text-[var(--mk-muted)]">{t("why.cards.teams.body")}</p>
              </GlowCard>
            </Reveal>
            <Reveal className="md:col-span-2" delay={160}>
              <GlowCard className="h-full p-8">
                <IconTile icon={Share2} tone="violet" />
                <h3 className="mt-6 text-xl font-semibold">{t("why.cards.social.title")}</h3>
                <p className="mt-3 text-[var(--mk-muted)]">{t("why.cards.social.body")}</p>
              </GlowCard>
            </Reveal>
            <Reveal className="md:col-span-6">
              <GlowCard className="p-8">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <IconTile icon={ShieldCheck} tone="cyan" />
                  <div>
                    <h3 className="text-xl font-semibold">{t("why.cards.control.title")}</h3>
                    <p className="mt-2 max-w-3xl text-[var(--mk-muted)]">{t("why.cards.control.body")}</p>
                  </div>
                </div>
              </GlowCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* DEVICES */}
      <section className="mk-section overflow-hidden">
        <div aria-hidden="true" className="mk-spot mk-spot-violet left-[10%] top-[30%]" />
        <div aria-hidden="true" className="mk-spot mk-spot-magenta right-[10%] top-[50%]" />
        <div className="mk-wrap">
          <SectionHead eyebrow={t("devices.eyebrow")} title={t("devices.title")} lead={t("devices.lead")} />
          <div className="relative mx-auto mt-16 max-w-5xl">
            <Reveal>
              <div style={{ perspective: "1600px" }}>
                <div style={{ transform: "rotateY(-8deg) rotateX(3deg)" }} className="w-[88%]">
                  <Laptop src="/mockups/analytics.webp" alt={t("devices.laptopAlt")} sizes="(min-width: 1024px) 860px, 90vw" />
                </div>
              </div>
            </Reveal>
            <Reveal delay={150} className="absolute -bottom-6 right-0 w-[34%] max-w-[15rem] sm:-bottom-10">
              <PhoneFeed />
            </Reveal>
          </div>
          <p className="mt-16 text-center text-xs text-[var(--mk-muted)]">{t("devices.note")}</p>
        </div>
      </section>

      {/* ROADMAP */}
      <section className="mk-section">
        <div className="mk-wrap">
          <SectionHead eyebrow={t("soon.eyebrow")} title={t("soon.title")} lead={t("soon.lead")} />
          <ul className="mx-auto mt-14 grid max-w-3xl gap-5 md:grid-cols-2">
            {soon.map((key, index) => (
              <Reveal as="li" key={key} delay={index * 90}>
                <GlowCard className="h-full p-7">
                  <div className="flex items-center justify-between">
                    <IconTile icon={soonIcons[key]} tone={key === "charts" ? "violet" : "coral"} />
                    <span className="mk-chip mk-chip-soon">{common("comingSoon")}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold">{t(`soon.items.${key}.title`)}</h3>
                  <p className="mt-2 text-[var(--mk-muted)]">{t(`soon.items.${key}.body`)}</p>
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
        secondary={t("cta.secondary")}
      />
    </>
  );
}
