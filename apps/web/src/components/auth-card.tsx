import type { ReactNode } from "react";
import { useLocale } from "next-intl";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const locale = useLocale();
  return (
    <div lang={locale} className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-16">
      <div className="mk-card p-8 sm:p-10">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
