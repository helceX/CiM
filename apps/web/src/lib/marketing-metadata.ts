import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BLOG_ORIGIN } from "../content/blog";

export const MARKETING_PATHS = {
  home: "",
  features: "/features",
  solutions: "/solutions",
  pricing: "/pricing",
  resources: "/resources",
  contact: "/contact",
  security: "/security",
} as const;

export async function marketingMetadata(
  page: keyof typeof MARKETING_PATHS,
): Promise<Metadata> {
  const t = await getTranslations(`meta.pages.${page}`);
  const locale = await getLocale();
  const title = t("title");
  const description = t("description");
  const url = `${BLOG_ORIGIN}${MARKETING_PATHS[page]}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: "Mediaory",
      locale: locale === "tr" ? "tr_TR" : "en_US",
    },
    twitter: { card: "summary", title, description },
  };
}
