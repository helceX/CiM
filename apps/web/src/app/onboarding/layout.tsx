import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { ONBOARDING_NAMESPACES } from "@/i18n/groups";
import { pickMessages } from "@/i18n/pick";

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const messages = await pickMessages(ONBOARDING_NAMESPACES);
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
