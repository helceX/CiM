import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AUTH_NAMESPACES } from "@/i18n/groups";
import { pickMessages } from "@/i18n/pick";
import { MarketingHeader } from "@/components/marketing/site-header";
import { MarketingFooter } from "@/components/marketing/site-footer";
import "../marketing.css";

/** Auth and invitation pages share the marketing canvas so the first
 * screen after the landing page feels like the same product. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const messages = await pickMessages(AUTH_NAMESPACES);
  return (
    <NextIntlClientProvider messages={messages}>
      <div className="mk flex min-h-screen flex-col">
        <MarketingHeader />
        <main className="flex-1">{children}</main>
        <MarketingFooter />
      </div>
    </NextIntlClientProvider>
  );
}
