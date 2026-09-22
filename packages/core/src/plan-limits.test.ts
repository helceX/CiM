import { describe, expect, it } from "vitest";
import { getMonitoringQueryLimit } from "./plan-limits";

describe("getMonitoringQueryLimit", () => {
  it("caps the free plan at 1, matching the pricing page's published limit", () => {
    expect(getMonitoringQueryLimit("free")).toBe(1);
  });

  it("is unlimited for every paid plan", () => {
    expect(getMonitoringQueryLimit("starter")).toBeNull();
    expect(getMonitoringQueryLimit("pro")).toBeNull();
    expect(getMonitoringQueryLimit("enterprise")).toBeNull();
  });

  it("treats an unrecognized plan string as unlimited, never mistaken for free's cap", () => {
    expect(getMonitoringQueryLimit("trial")).toBeNull();
    expect(getMonitoringQueryLimit("")).toBeNull();
  });
});
