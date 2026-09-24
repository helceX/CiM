import { MarketingPage, MarketingSection } from "@/components/marketing-page";

export default function SolutionsPage() {
  return (
    <MarketingPage
      title="Solutions"
      intro="One platform, tuned to how different teams actually work."
    >
      <MarketingSection
        title="Corporate communications"
        desc="Daily brand and executive monitoring, crisis signal detection, and reports your leadership team will actually read."
      />
      <MarketingSection
        title="PR & agencies"
        desc="Manage multiple client projects side by side, each with its own queries, sources, and reporting cadence."
      />
      <MarketingSection
        title="Brand & reputation management"
        desc="Sentiment trends, share of voice, and competitor comparison — grounded in real, source-attributed data."
      />
      <MarketingSection
        title="Executives"
        desc="An executive brief that answers one question fast: what changed since yesterday, and why does it matter?"
      />
    </MarketingPage>
  );
}
