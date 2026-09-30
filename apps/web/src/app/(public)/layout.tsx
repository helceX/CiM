import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/marketing/site-header";
import { MarketingFooter } from "@/components/marketing/site-footer";
import "../marketing.css";

/** Auth and invitation pages share the marketing canvas so the first
 * screen after the landing page feels like the same product. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mk flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
