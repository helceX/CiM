import { describe, expect, it } from "vitest";
import { createVisualSchema, visualSpecSchema } from "./visuals";

const valid = { measure: "mentions", dimension: "day" };

describe("visualSpecSchema", () => {
  it("applies defaults", () => {
    const spec = visualSpecSchema.parse(valid);
    expect(spec).toMatchObject({ periodDays: 30, chartType: "bar", sort: "value_desc", limit: 50, filters: {} });
  });

  it("rejects anything outside the closed vocabulary", () => {
    expect(visualSpecSchema.safeParse({ ...valid, measure: "revenue" }).success).toBe(false);
    expect(visualSpecSchema.safeParse({ ...valid, dimension: "password_hash" }).success).toBe(false);
    expect(visualSpecSchema.safeParse({ ...valid, periodDays: 31 }).success).toBe(false);
    expect(visualSpecSchema.safeParse({ ...valid, limit: 1001 }).success).toBe(false);
    expect(visualSpecSchema.safeParse({ ...valid, limit: 0 }).success).toBe(false);
  });

  it("rejects unknown keys instead of storing them", () => {
    expect(visualSpecSchema.safeParse({ ...valid, sql: "select 1" }).success).toBe(false);
    expect(visualSpecSchema.safeParse({ ...valid, filters: { organizationId: "x" } }).success).toBe(false);
  });

  it.each(["'; drop table mentions; --", "1 or 1=1", "day; select pg_sleep(9)", "__proto__"])(
    "never lets %s through an enum or id field",
    (payload) => {
      expect(visualSpecSchema.safeParse({ ...valid, measure: payload }).success).toBe(false);
      expect(visualSpecSchema.safeParse({ ...valid, dimension: payload }).success).toBe(false);
      expect(visualSpecSchema.safeParse({ ...valid, filters: { projectId: payload } }).success).toBe(false);
      expect(visualSpecSchema.safeParse({ ...valid, filters: { queryIds: [payload] } }).success).toBe(false);
      expect(visualSpecSchema.safeParse({ ...valid, filters: { brandGroupIds: [payload] } }).success).toBe(false);
      expect(visualSpecSchema.safeParse({ ...valid, filters: { sentiments: [payload] } }).success).toBe(false);
    },
  );

  it("requires a name when saving", () => {
    expect(createVisualSchema.safeParse({ name: "  ", spec: valid }).success).toBe(false);
    expect(createVisualSchema.parse({ name: "Weekly volume", spec: valid }).kind).toBe("chart");
  });
});
