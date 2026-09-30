import Link from "next/link";
import { Button } from "@cim/ui";

const LOOP_STEPS = [
  { title: "Watch", desc: "Monitor news, web, and social continuously — no manual checking." },
  { title: "Filter", desc: "Boolean queries and source filters cut noise, not signal." },
  { title: "Understand", desc: "Deduplication and story clustering group coverage that belongs together." },
  { title: "Alert", desc: "Grouped, threshold-aware alerts — not a flood of duplicate emails." },
  { title: "Report", desc: "Executive-ready reports and daily digests, generated automatically." },
];

const PILLARS = [
  {
    title: "Grounded AI",
    desc: "Every AI insight ships with evidence, sources, and a confidence score. No unsupported claims.",
  },
  {
    title: "Honest data",
    desc: "Reach and engagement are shown as \"Not available\" when a source doesn't report them — never estimated silently.",
  },
  {
    title: "Built for teams",
    desc: "Organizations, workspaces, and projects with role-based access — from analysts to executives.",
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Understand what the world is saying about your brand — before it becomes a headline.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          CiM is a communication intelligence platform for corporate communications, PR, and
          brand teams. One place to monitor, filter, understand, and act.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/register">Start monitoring</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/features">See how it works</Link>
          </Button>
        </div>
      </section>

      <section className="border-y border-border bg-surface-muted">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-16 md:grid-cols-5">
          {LOOP_STEPS.map((step) => (
            <div key={step.title} className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-primary">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-foreground">{pillar.title}</h2>
              <p className="text-sm text-muted-foreground">{pillar.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
