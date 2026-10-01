import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHero } from "@/components/marketing/sections";
import { getTurnstileSiteKey } from "@/lib/turnstile";
import { TakedownForm } from "./takedown-form";

// The Turnstile key is read per request from runtime environment variables.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.takedown");
  return { title: `${t("title")} ${t("accent")}` };
}

export default async function TakedownPage() {
  const t = await getTranslations("legal.takedown");
  return (
    <>
      <PageHero eyebrow={t("eyebrow")} title={t("title")} accent={t("accent")} lead={t("lead")} />
      <section className="mk-section pt-6">
        <div className="mk-wrap max-w-2xl">
          <TakedownForm turnstileSiteKey={getTurnstileSiteKey()} />
        </div>
      </section>
    </>
  );
}
