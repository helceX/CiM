import Link from "next/link";
import { Button } from "@cim/ui";
import { MarketingPage } from "@/components/marketing-page";

const PLANS = [
  {
    name: "Free",
    desc: "Get started with a single monitoring project.",
    features: ["1 project", "1 monitoring query", "Daily digest"],
  },
  {
    name: "Professional",
    desc: "For growing communications teams.",
    features: ["Multiple projects", "Advanced alerts", "Report builder"],
  },
  {
    name: "Business",
    desc: "For agencies and larger organizations.",
    features: ["Team roles & permissions", "API access", "Priority sources"],
  },
  {
    name: "Enterprise",
    desc: "Custom limits, SSO, and dedicated support.",
    features: ["SSO / SAML / OIDC", "Custom data retention", "Dedicated onboarding"],
  },
];

export default function PricingPage() {
  return (
    <MarketingPage
      title="Pricing"
      intro="Plans scale with how much you need to monitor. Contact us for current pricing and enterprise terms."
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <div key={plan.name} className="flex flex-col gap-4 rounded-lg border border-border p-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.desc}</p>
            </div>
            <ul className="flex flex-1 flex-col gap-1.5 text-sm text-muted-foreground">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Button asChild variant="secondary" size="sm">
              <Link href="/contact">Talk to us</Link>
            </Button>
          </div>
        ))}
      </div>
    </MarketingPage>
  );
}
