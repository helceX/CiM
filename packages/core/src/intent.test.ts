import { describe, expect, it } from "vitest";
import { FOCUS_OPTIONS, focusFloor, normalizeIntent, priorityRank, visibleAtFocus } from "./intent";
import { assembleQueryAst } from "./monitoring-input";

describe("normalizeIntent", () => {
  it("has nothing to say about nothing", () => {
    expect(normalizeIntent(undefined)).toBeUndefined();
    expect(normalizeIntent(null)).toBeUndefined();
    expect(normalizeIntent("risk")).toBeUndefined();
    expect(normalizeIntent(["risk"])).toBeUndefined();
  });

  it("defaults to plain coverage at a balanced focus", () => {
    expect(normalizeIntent({})).toEqual({ goals: ["coverage"], focus: "balanced", signalWords: [] });
  });

  it("keeps known goals once and drops the rest", () => {
    const intent = normalizeIntent({ goals: ["risk", "opportunity", "risk", "nonsense", 7], focus: "essentials" });
    expect(intent).toEqual({ goals: ["risk", "opportunity"], focus: "essentials", signalWords: [] });
  });

  it("falls back to balanced for an unknown focus", () => {
    expect(normalizeIntent({ focus: "loud" })!.focus).toBe("balanced");
  });

  it("trims, de-duplicates (Turkish-aware) and caps the person's own words", () => {
    const many = Array.from({ length: 40 }, (_, i) => `word ${i}`);
    expect(normalizeIntent({ signalWords: ["  IŞIK  ", "ışık", "x".repeat(61), "", 4, "Q3  results"] })!.signalWords).toEqual(["IŞIK", "Q3 results"]);
    expect(normalizeIntent({ signalWords: many })!.signalWords).toHaveLength(20);
  });
});

describe("focus", () => {
  it("ranks priorities like the database does", () => {
    expect(["low", "normal", "high", "critical"].map(priorityRank)).toEqual([1, 2, 3, 4]);
    expect(priorityRank(null)).toBe(0);
    expect(priorityRank("whatever")).toBe(0);
  });

  it("shows only what the focus asks for", () => {
    expect(visibleAtFocus("high", "essentials")).toBe(true);
    expect(visibleAtFocus("critical", "essentials")).toBe(true);
    expect(visibleAtFocus("normal", "essentials")).toBe(false);
    expect(visibleAtFocus("normal", "balanced")).toBe(true);
    expect(visibleAtFocus("low", "balanced")).toBe(false);
    expect(visibleAtFocus("low", "everything")).toBe(true);
  });

  it("a monitoring with no focus shows everything", () => {
    expect(focusFloor(undefined)).toBe(0);
    expect(visibleAtFocus("low", undefined)).toBe(true);
    expect(visibleAtFocus("low", null)).toBe(true);
  });

  it("offers the three choices in order", () => {
    expect(FOCUS_OPTIONS.map((option) => option.key)).toEqual(["essentials", "balanced", "everything"]);
  });
});

describe("assembleQueryAst carries the intent", () => {
  it("stores a clean intent on the AST and leaves it out when there is none", () => {
    const input = { include: ["Acme"], exclude: [], exactPhrases: [] };
    expect(assembleQueryAst(input).intent).toBeUndefined();
    expect("intent" in assembleQueryAst(input)).toBe(false);
    const ast = assembleQueryAst({ ...input, intent: { goals: ["risk"], focus: "essentials", signalWords: [" Q3 "] } });
    expect(ast.intent).toEqual({ goals: ["risk"], focus: "essentials", signalWords: ["Q3"] });
  });
});

describe("intentSummary", () => {
  it("says what was asked for in two short phrases", async () => {
    const { intentSummary } = await import("./signal-goals");
    expect(intentSummary(undefined)).toBeNull();
    expect(intentSummary({ goals: ["coverage"], focus: "balanced", signalWords: [] })).toEqual({
      looking: "Every story that names what you track",
      showing: "Balanced",
    });
    expect(intentSummary({ goals: ["risk", "opportunity"], focus: "essentials", signalWords: ["Q3", "lisans"] })).toEqual({
      looking: "Risks & crises, Opportunities & funding + 2 words of your own",
      showing: "Only what matters",
    });
    expect(intentSummary({ goals: ["coverage"], focus: "everything", signalWords: ["Q3"] })!.looking).toBe("1 word of your own");
  });
});
