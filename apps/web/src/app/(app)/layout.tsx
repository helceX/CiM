import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { UiLabelsProvider } from "@cim/ui";
import { db, countUnreadNotifications } from "@cim/db";
import { getOrgContext } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { PANEL_NAMESPACES } from "@/i18n/groups";
import { pickMessages } from "@/i18n/pick";
import "../panel.css";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [context, user] = await Promise.all([getOrgContext(), getCurrentUser()]);
  if (!context || !user) {
    redirect("/login");
  }

  const [unreadCount, locale, shell, ui, messages] = await Promise.all([
    countUnreadNotifications(db, context.organizationId, context.userId),
    getLocale(),
    getTranslations("shell"),
    getTranslations("ui"),
    pickMessages(PANEL_NAMESPACES),
  ]);

  return (
    <NextIntlClientProvider messages={messages}>
      <UiLabelsProvider labels={{ close: ui("close") }}>
        <div
          lang={locale}
          className="mp flex min-h-screen"
          data-mp-theme="dark"
          suppressHydrationWarning
        >
          {/* Apply a remembered light theme before first paint so it never flashes dark. */}
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{var t=localStorage.getItem('mediaory-panel-theme');if(t==='light'){document.querySelector('.mp').setAttribute('data-mp-theme','light')}}catch(e){}",
            }}
          />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
          >
            {shell("skip")}
          </a>
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <AppTopbar
              organizationName={context.organizationName}
              userLabel={`${user.firstName} ${user.lastName}`}
              initialUnreadCount={unreadCount}
            />
            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 px-4 py-6 outline-none md:px-6 md:py-8"
            >
              {children}
            </main>
          </div>
        </div>
      </UiLabelsProvider>
    </NextIntlClientProvider>
  );
}
