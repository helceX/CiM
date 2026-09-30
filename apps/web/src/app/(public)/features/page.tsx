import { MarketingPage, MarketingSection } from "@/components/marketing-page";

export default function FeaturesPage() {
  return (
    <MarketingPage
      title="Features"
      intro="Everything communications, PR, and brand teams need to go from raw coverage to a decision — in one loop."
    >
      <MarketingSection
        title="Monitoring & query builder"
        desc="Track brands, products, executives, competitors, and topics with a chip-based simple mode or full Boolean syntax — the same query, either way."
      />
      <MarketingSection
        title="Deduplication & story clustering"
        desc="The same story from 30 outlets shows up once, with every source attached — not 30 separate alerts."
      />
      <MarketingSection
        title="Alerts that don't cry wolf"
        desc="Spike, sentiment-shift, and crisis detection with grouping and cooldowns, so your team sees what matters, not everything."
      />
      <MarketingSection
        title="Grounded AI insights"
        desc="Executive summaries, risk signals, and recommendations — every claim linked to the mentions and metrics behind it."
      />
      <MarketingSection
        title="Reports on your schedule"
        desc="Daily digests and weekly/monthly reports, from templates or a fully custom report builder, exported to PDF, CSV, or XLSX."
      />
    </MarketingPage>
  );
}
