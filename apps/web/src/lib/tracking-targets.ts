import type { TrackingTarget } from "@cim/validation";

/**
 * docs/product/USER_FLOWS.md onboarding step 1 — shared between the
 * onboarding wizard and the Create Monitoring Query form so a query's
 * "what does this track?" always offers the same options, whichever
 * screen created it.
 */
export const TRACKING_TARGET_OPTIONS: { value: TrackingTarget; label: string }[] = [
  { value: "company", label: "Company" },
  { value: "brand", label: "Brand" },
  { value: "product", label: "Product" },
  { value: "competitor", label: "Competitor" },
  { value: "campaign", label: "Campaign" },
  { value: "topic", label: "Topic" },
  { value: "person", label: "Person" },
  { value: "industry", label: "Industry" },
];
