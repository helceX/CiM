import { getLocale } from "next-intl/server";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const locale = await getLocale();
  return (
    <div lang={locale}>
      <OnboardingWizard />
    </div>
  );
}
