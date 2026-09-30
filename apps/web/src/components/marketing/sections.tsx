import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./reveal";
import { Laptop } from "./devices";

export function PageHero({
  eyebrow,
  title,
  accent,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  lead: string;
  children?: ReactNode;
}) {
  return (
    <section className="mk-section pb-10 pt-24 text-center sm:pt-32">
      <div className="mk-wrap">
        <Reveal className="flex flex-col items-center gap-6">
          <span className="mk-eyebrow"><i aria-hidden="true" />{eyebrow}</span>
          <h1 className="max-w-4xl text-[clamp(2.4rem,6.4vw,4.75rem)] font-semibold">
            {title} <span className="mk-gradient-text">{accent}</span>
          </h1>
          <p className="mk-lead max-w-2xl">{lead}</p>
          {children}
        </Reveal>
      </div>
    </section>
  );
}

export function SectionHead({
  eyebrow,
  title,
  accent,
  lead,
  center = true,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  lead?: string;
  center?: boolean;
}) {
  return (
    <Reveal className={`flex flex-col gap-5 ${center ? "items-center text-center" : ""}`}>
      {eyebrow ? (
        <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--mk-cyan)]">{eyebrow}</span>
      ) : null}
      <h2 className="mk-h2 max-w-3xl">
        {title} {accent ? <span className="mk-gradient-text">{accent}</span> : null}
      </h2>
      {lead ? <p className="mk-lead max-w-2xl">{lead}</p> : null}
    </Reveal>
  );
}

/** Copy on one side, a real product screen on the other; flips on odd rows. */
export function FeatureRow({
  index,
  title,
  body,
  points,
  src,
  alt,
}: {
  index: number;
  title: string;
  body: string;
  points: string[];
  src: string;
  alt: string;
}) {
  const flip = index % 2 === 1;
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={flip ? "lg:order-2" : ""}>
        <div className="flex flex-col gap-5">
          <h2 className="mk-h2 text-[clamp(1.75rem,3.4vw,2.6rem)]">{title}</h2>
          <p className="mk-lead">{body}</p>
          <ul className="mt-2 flex flex-col gap-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[0.95rem] text-zinc-200">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ background: "var(--mk-gradient-solid)" }}
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
      <Reveal delay={120} className={flip ? "lg:order-1" : ""}>
        <div style={{ perspective: "1400px" }}>
          <div style={{ transform: `rotateY(${flip ? 6 : -6}deg) rotateX(2deg)` }}>
            <Laptop src={src} alt={alt} />
          </div>
        </div>
      </Reveal>
    </div>
  );
}

export function CtaBand({
  title,
  body,
  primary,
  primaryHref = "/register",
  secondary,
  secondaryHref = "/contact",
}: {
  title: string;
  body: string;
  primary: string;
  primaryHref?: string;
  secondary?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="mk-section pb-24">
      <div className="mk-wrap">
        <Reveal>
          <div
            className="relative overflow-hidden rounded-[2rem] border border-[var(--mk-line)] px-6 py-16 text-center sm:px-16 sm:py-20"
            style={{
              background:
                "radial-gradient(40rem 20rem at 15% 0%, rgb(123 92 255 / 0.55), transparent 60%), radial-gradient(36rem 20rem at 90% 100%, rgb(255 79 163 / 0.45), transparent 60%), var(--mk-ink-2)",
            }}
          >
            <h2 className="mk-h2 mx-auto max-w-2xl">{title}</h2>
            <p className="mk-lead mx-auto mt-5 max-w-xl">{body}</p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href={primaryHref} className="mk-btn mk-btn-primary">
                {primary} <ArrowRight aria-hidden="true" />
              </Link>
              {secondary ? (
                <Link href={secondaryHref} className="mk-btn mk-btn-ghost">
                  {secondary}
                </Link>
              ) : null}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
