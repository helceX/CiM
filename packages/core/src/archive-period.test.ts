import { describe, expect, it } from "vitest";
import { lastCompletedWeek, periodLabelForStart } from "./archive-period";

describe("lastCompletedWeek (Monday–Sunday, Türkiye time)", () => {
  it("on a Monday morning gives the week that just ended", () => {
    // Mon 2026-10-05 01:00 UTC = 04:00 in Türkiye
    expect(lastCompletedWeek(new Date("2026-10-05T01:00:00Z"))).toEqual({ start: "2026-09-28", end: "2026-10-04", label: "2026-W40" });
  });
  it("mid-week still gives the last fully ended week", () => {
    expect(lastCompletedWeek(new Date("2026-10-08T12:00:00Z")).start).toBe("2026-09-28");
  });
  it("counts the local day: Sunday 22:00 UTC is already Monday in Türkiye", () => {
    expect(lastCompletedWeek(new Date("2026-10-04T22:00:00Z")).start).toBe("2026-09-28");
    expect(lastCompletedWeek(new Date("2026-10-04T20:59:00Z")).start).toBe("2026-09-21");
  });
  it("labels ISO weeks across a year boundary", () => {
    expect(periodLabelForStart("2025-12-29")).toBe("2026-W01");
    expect(periodLabelForStart("2026-01-05")).toBe("2026-W02");
    expect(periodLabelForStart("2024-12-30")).toBe("2025-W01");
  });
});
