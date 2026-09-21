import { describe, expect, it } from "vitest";
import type { Db } from "@cim/db";
import { gatherReportData } from "./gather-data";

describe("gatherReportData", () => {
  it("rejects an unrecognized template key before touching the database", async () => {
    // No real Db needed — the check must happen before any query runs.
    const fakeDb = {} as Db;
    await expect(
      gatherReportData(fakeDb, "org" as never, {
        projectId: "p1",
        projectName: "Project",
        templateKey: "does_not_exist" as never,
        periodType: "rolling_7d",
      }),
    ).rejects.toThrow(/Unknown report template/);
  });
});
