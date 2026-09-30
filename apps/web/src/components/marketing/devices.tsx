import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { WordmarkGlyph } from "@cim/ui";

/** Screens are real captures of the product (public/mockups/*.webp). */
export function Laptop({
  src,
  alt,
  priority = false,
  sizes = "(min-width: 1024px) 720px, 92vw",
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    <div className={`mk-laptop ${className ?? ""}`}>
      <div className="mk-laptop-screen">
        <Image
          src={src}
          alt={alt}
          width={1800}
          height={1125}
          sizes={sizes}
          priority={priority}
          draggable={false}
        />
      </div>
    </div>
  );
}

const SENTIMENT_STYLE = {
  positive: "bg-emerald-400/15 text-emerald-300",
  neutral: "bg-white/10 text-zinc-200",
  negative: "bg-rose-400/15 text-rose-300",
} as const;

/**
 * The phone screen is composed from the same fields the product shows on a
 * mention (headline, source, sentiment) plus an alert push; it illustrates
 * the on-the-go experience rather than being a capture.
 */
export async function PhoneFeed({ className }: { className?: string }) {
  const t = await getTranslations("devices.phone");
  const items = [
    { title: t("m1"), source: "Northwind Blog Network", sentiment: "positive" as const },
    { title: t("m2"), source: "Northwind Blog Network", sentiment: "neutral" as const },
    { title: t("m3"), source: "Northwind Blog Network", sentiment: "neutral" as const },
    { title: t("m4"), source: "Northwind Blog Network", sentiment: "neutral" as const },
  ];
  return (
    <div className={`mk-phone ${className ?? ""}`}>
      <div className="mk-phone-screen">
        <div className="flex h-full flex-col gap-3 px-3.5 pb-4 pt-9">
          <div className="flex items-center justify-between text-[0.7rem] text-zinc-400">
            <span className="inline-flex items-center gap-1.5 font-semibold text-white">
              <WordmarkGlyph className="text-fuchsia-400" /> Mediaory
            </span>
            <span>{t("now")}</span>
          </div>

          <div className="rounded-2xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/20 to-violet-500/10 p-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-fuchsia-300">
              {t("alertKind")}
            </p>
            <p className="mt-1 text-[0.78rem] font-semibold leading-snug text-white">{t("alertTitle")}</p>
            <p className="mt-1 text-[0.68rem] leading-snug text-zinc-300">{t("alertBody")}</p>
          </div>

          <p className="mt-1 text-[0.72rem] font-semibold text-white">{t("mentions")}</p>
          <ul className="flex flex-1 flex-col gap-2 overflow-hidden">
            {items.map((item) => (
              <li key={item.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                <p className="text-[0.72rem] font-medium leading-snug text-zinc-100">{item.title}</p>
                <div className="mt-1.5 flex items-center justify-between text-[0.62rem] text-zinc-400">
                  <span>{item.source}</span>
                  <span className={`rounded-full px-1.5 py-0.5 font-semibold ${SENTIMENT_STYLE[item.sentiment]}`}>
                    {t(item.sentiment)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
