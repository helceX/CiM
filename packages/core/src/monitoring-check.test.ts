import { describe, expect, it } from "vitest";
import { explainMonitoringCheck, termsToTsQuery, type MonitoringCheckFacts } from "./monitoring-check";

describe("termsToTsQuery", () => {
  it("ands the words of a term, opens each word's end, and ors the terms", () => {
    expect(termsToTsQuery(["Bilgiyi Ticarileştirme Merkezi", "BTM"])).toBe("(bilgiyi:* & ticarileştirme:* & merkezi:*) | (btm:*)");
  });

  it("folds Turkish capitals the way the stored search vector was folded", () => {
    expect(termsToTsQuery(["İstanbul Ticaret Odası", "ISPARTA"])).toBe("(istanbul:* & ticaret:* & odası:*) | (ısparta:*)");
  });

  it("splits on punctuation and apostrophes, drops one-letter words and a trailing star", () => {
    expect(termsToTsQuery(["O'Reilly", "e-ticaret", "banka*"])).toBe("(reilly:*) | (ticaret:*) | (banka:*)");
    expect(termsToTsQuery(["Acme'nin", "Mavi Ay"])).toBe("(acme:* & nin:*) | (mavi:* & ay:*)");
  });

  it("skips terms without a usable word, and returns null when none is left", () => {
    expect(termsToTsQuery(["#", "x", "  "])).toBeNull();
    expect(termsToTsQuery([])).toBeNull();
    expect(termsToTsQuery(["#", "yatırım"])).toBe("(yatırım:*)");
  });

  it("produces nothing that could change the query's meaning", () => {
    const query = termsToTsQuery(["a' | b", "x:* & (y)", "'; drop table articles; --"]) ?? "";
    expect(query).not.toMatch(/[';]/);
    expect(query).not.toContain("--");
  });
});

const healthy: MonitoringCheckFacts = {
  sources: { inScope: 5200, active: 6900 },
  crawl: { minutesSinceLastScan: 12 },
  stories: { last24h: 41_000 },
  keywords: [
    { term: "BTM", last24h: 0, last7d: 3 },
    { term: "Bilgiyi Ticarileştirme Merkezi", last24h: 0, last7d: 0 },
  ],
  mentions: { last24h: 0, last7d: 1, total: 4 },
  alerts: { active: 1, total: 1 },
  missed: { count: 0, checked: 3 },
};

describe("explainMonitoringCheck", () => {
  it("says a rare keyword is simply quiet when everything upstream works", () => {
    const verdict = explainMonitoringCheck(healthy);
    expect(verdict.level).toBe("quiet");
    expect(verdict.headline).toContain("41,000 stories from 5,200 sources");
    expect(verdict.headline).toContain("none of them contained");
    expect(verdict.advice.join(" ")).toContain("3 stories over the last 7 days");
  });

  it("says Working when mentions arrived in the last 24 hours", () => {
    const verdict = explainMonitoringCheck({ ...healthy, mentions: { last24h: 2, last7d: 5, total: 9 } });
    expect(verdict.level).toBe("ok");
    expect(verdict.headline).toContain("2 mentions reached this monitoring");
  });

  it("points at the source types and region when no source is in scope", () => {
    const verdict = explainMonitoringCheck({ ...healthy, sources: { inScope: 0, active: 6900 } });
    expect(verdict.level).toBe("problem");
    expect(verdict.headline).toContain("No active source matches");
  });

  it("blames the crawler when nothing was scanned for hours, for every monitoring alike", () => {
    const verdict = explainMonitoringCheck({ ...healthy, crawl: { minutesSinceLastScan: 9 * 60 } });
    expect(verdict.level).toBe("problem");
    expect(verdict.headline).toContain("9 hours ago");
    expect(verdict.advice[0]).toContain("not specific to this monitoring");
    expect(explainMonitoringCheck({ ...healthy, crawl: { minutesSinceLastScan: null } }).headline).toContain("No source has been scanned");
  });

  it("reports an empty collection even though the crawler runs", () => {
    const verdict = explainMonitoringCheck({ ...healthy, stories: { last24h: 0 } });
    expect(verdict.level).toBe("problem");
    expect(verdict.headline).toContain("collected no stories");
  });

  it("flags stories that match but are not saved, ahead of the quiet explanation", () => {
    const verdict = explainMonitoringCheck({ ...healthy, missed: { count: 1, checked: 4 } });
    expect(verdict.level).toBe("problem");
    expect(verdict.headline).toContain("1 story collected after this monitoring was saved");
  });

  it("explains keywords whose words appear but not in an accepted form", () => {
    const verdict = explainMonitoringCheck({ ...healthy, keywords: [{ term: "BTM", last24h: 2, last7d: 6 }] });
    expect(verdict.level).toBe("quiet");
    expect(verdict.advice.join(" ")).toContain("2 stories in the last 24 hours contain a keyword's words");
  });

  it("says plainly when the keywords' words never appeared in a week", () => {
    const verdict = explainMonitoringCheck({ ...healthy, keywords: [{ term: "Rare", last24h: 0, last7d: 0 }] });
    expect(verdict.advice[0]).toContain("None of the keywords' words appeared");
  });

  it("tells a monitoring without an alert rule that it sends no notifications, whatever else is true", () => {
    const none = explainMonitoringCheck({ ...healthy, alerts: { active: 0, total: 0 } });
    expect(none.level).toBe("quiet");
    expect(none.advice.at(-1)).toContain("No alert rule is set on this monitoring");
    const paused = explainMonitoringCheck({ ...healthy, mentions: { last24h: 3, last7d: 3, total: 3 }, alerts: { active: 0, total: 2 } });
    expect(paused.level).toBe("ok");
    expect(paused.advice.at(-1)).toContain("paused");
    expect(explainMonitoringCheck({ ...healthy, sources: { inScope: 0, active: 10 }, alerts: { active: 0, total: 0 } }).advice.at(-1)).toContain("No alert rule");
    // With an active rule nothing is added.
    expect(explainMonitoringCheck(healthy).advice.join(" ")).not.toContain("alert rule");
  });
});
