import type { ReactNode } from "react";

export function MarketingPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children?: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{intro}</p>
      {children ? <div className="mt-10 flex flex-col gap-8">{children}</div> : null}
    </section>
  );
}

export function MarketingSection({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="border-t border-border pt-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
