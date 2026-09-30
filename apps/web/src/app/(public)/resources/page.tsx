import { MarketingPage, MarketingSection } from "@/components/marketing-page";

export default function ResourcesPage() {
  return (
    <MarketingPage
      title="Resources"
      intro="Guides and reference material for getting the most out of CiM."
    >
      <MarketingSection
        title="Getting started"
        desc="Set up your first monitoring query and see live results in under three minutes — covered in the onboarding flow after you sign up."
      />
      <MarketingSection
        title="Query syntax"
        desc="Learn Boolean search — AND, OR, NOT, and exact phrases — for precise monitoring queries."
      />
      <MarketingSection
        title="API & webhooks"
        desc="Reference documentation for the CiM API and webhook events ships alongside the public API release."
      />
    </MarketingPage>
  );
}
