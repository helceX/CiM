import { expect, it } from "vitest";
import { filterOpportunityReviews } from "./review-filter";

it("filters only on recorded review state, without inferring verification from keyword score", () => {
  const items = [{ followup: null }, { followup: { status: "reviewing", sourceVerified: true } }, { followup: { status: "archived", sourceVerified: false } }];
  expect(filterOpportunityReviews(items, "all")).toHaveLength(3);
  expect(filterOpportunityReviews(items, "unreviewed")).toEqual([items[0]]);
  expect(filterOpportunityReviews(items, "source_checked")).toEqual([items[1]]);
  expect(filterOpportunityReviews(items, "archived")).toEqual([items[2]]);
});
