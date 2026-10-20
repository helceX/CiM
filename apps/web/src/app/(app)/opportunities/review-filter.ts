export type ReviewFilter = "all" | "source_checked" | "unreviewed" | "archived";

/** Manual source verification is not evidence that applications are open or that the customer is eligible. */
export function filterOpportunityReviews<T extends { followup: { status: string; sourceVerified: boolean } | null }>(items: T[], filter: ReviewFilter): T[] {
  return items.filter(item => filter === "all" || (filter === "source_checked" ? item.followup?.sourceVerified === true : filter === "archived" ? item.followup?.status === "archived" : !item.followup || item.followup.status === "new"));
}
