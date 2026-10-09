import { describe, expect, it } from "vitest";
import { GOAL_KEYS, type MonitoringIntent } from "./intent";
import { SIGNAL_GOALS, goalWords } from "./signal-goals";
import { parseKeywordSpec } from "./keyword-match";
import {
  HIGH_AT,
  NORMAL_AT,
  OPENING_CHARS,
  applyCoverage,
  describeSignal,
  scoreSignal,
  signalLevelLabel,
  type SignalInput,
} from "./signal";

const ast = (include: string[], extra: Partial<SignalInput["ast"]> = {}) => ({ include, exclude: [], exactPhrases: [], ...extra });
const intent = (goals: MonitoringIntent["goals"], signalWords: string[] = [], focus: MonitoringIntent["focus"] = "balanced"): MonitoringIntent => ({
  goals,
  focus,
  signalWords,
});
const score = (input: Partial<SignalInput> & Pick<SignalInput, "title">) =>
  scoreSignal({ ast: ast(["Acme"]), target: "company", sourceType: "news", language: "en", ...input });

describe("where the tracked words are decides the base", () => {
  it("a name in the headline of a news outlet is important", () => {
    const signal = score({ title: "Acme opens a new plant in Izmir" });
    expect(signal.level).toBe("high");
    expect(signal.reasons.map((r) => r.code)).toEqual(["headline", "editorial"]);
    expect(signal.reasons[0]).toEqual({ code: "headline", terms: ["Acme"] });
  });

  it("the same headline on a blog is worth a look, not more", () => {
    const signal = score({ title: "Acme opens a new plant in Izmir", sourceType: "blog" });
    expect(signal.level).toBe("normal");
    expect(signal.reasons.map((r) => r.code)).toEqual(["headline"]);
  });

  it("a name only in the opening lines is worth a look", () => {
    const signal = score({ title: "Plant opens in Izmir", lead: "Acme said on Monday that the plant will employ 300 people." });
    expect(signal.level).toBe("normal");
    expect(signal.reasons[0]).toEqual({ code: "lead", terms: ["Acme"] });
  });

  it("a name beyond the opening lines is only a passing mention", () => {
    const filler = "x".repeat(OPENING_CHARS + 20);
    const signal = score({ title: "Plant opens in Izmir", lead: `${filler} Acme said so.` });
    expect(signal.level).toBe("low");
    expect(signal.reasons.map((r) => r.code)).toEqual(["deep", "editorial"]);
  });

  it("a story matched on words deeper than the stored lines has no hit to show", () => {
    const signal = score({ title: "Something else entirely", lead: "Nothing here." });
    expect(signal.reasons[0]).toEqual({ code: "deep" });
    expect(signal.level).toBe("low");
  });
});

describe("a name weighs more than a topic", () => {
  const topic = { ast: ast(["yatırım"]), target: "topic", language: "tr" } as const;

  it("a topic word in a headline is worth a look; in the lead only it is a passing mention", () => {
    expect(score({ ...topic, title: "Yatırım bütçesi açıklandı" }).level).toBe("normal");
    expect(score({ ...topic, title: "Bütçe açıklandı", lead: "Yatırım kalemleri de belli oldu." }).level).toBe("low");
  });

  it("the same word as a brand name in the headline is important", () => {
    expect(score({ ast: ast(["Yatırım"]), target: "brand", language: "tr", title: "Yatırım açıldı" }).level).toBe("high");
  });

  it("a company set on the monitoring makes it a named one whatever the target", () => {
    const signal = score({ ast: ast(["İTO"], { company: { name: "İstanbul Ticaret Odası", short: "İTO" } }), target: "topic", language: "tr", title: "İTO Başkanı konuştu" });
    expect(signal.level).toBe("high");
  });
});

describe("what adds up", () => {
  it("an exact company name or phrase is an identity match", () => {
    const signal = score({ ast: ast(["Acme"], { exactPhrases: ["Acme Robotics"] }), title: "Acme Robotics wins a contract" });
    expect(signal.reasons.find((r) => r.code === "identity")).toEqual({ code: "identity", terms: ["Acme Robotics"] });
  });

  it("several different things in one story add up, but two names of one thing do not", () => {
    const two = scoreSignal({ ast: ast(["yatırım", "hibe"]), target: "topic", sourceType: "blog", language: "tr", title: "Yatırım ve hibe desteği" });
    expect(two.reasons).toContainEqual({ code: "several", n: 2 });

    const alias = scoreSignal({
      ast: ast(["BTM", "Bilgiyi Ticarileştirme Merkezi"], { aliasGroups: [["BTM", "Bilgiyi Ticarileştirme Merkezi"]] }),
      target: "company",
      sourceType: "blog",
      language: "tr",
      title: "BTM (Bilgiyi Ticarileştirme Merkezi) yeni dönem başvurularını açtı",
    });
    expect(alias.reasons.map((r) => r.code)).not.toContain("several");

    const family = scoreSignal({ ast: ast(["yatırım", "yatırımcı"]), target: "topic", sourceType: "blog", language: "tr", title: "Yatırımcılar yeni yatırım turunu bekliyor" });
    expect(family.reasons.map((r) => r.code)).not.toContain("several");
  });

  it("the words of a chosen goal lift a story, the more so in the headline", () => {
    const base = { ast: ast(["Acme"]), target: "company", sourceType: "blog", language: "en", intent: intent(["risk"]) } as const;
    const plain = scoreSignal({ ...base, title: "Acme opens a plant", lead: "A new plant." });
    const inHeadline = scoreSignal({ ...base, title: "Acme sued over data breach", lead: "A new plant." });
    const inText = scoreSignal({ ...base, title: "Acme opens a plant", lead: "Acme was sued last year." });
    expect(inHeadline.score).toBeGreaterThan(inText.score);
    expect(inText.score).toBeGreaterThan(plain.score);
    expect(inHeadline.reasons).toContainEqual({ code: "goal", goal: "risk", terms: ["sued", "data breach"], where: "headline" });
  });

  it("goal words only count for the goals that were chosen", () => {
    const risk = scoreSignal({ ast: ast(["Acme"]), target: "company", sourceType: "blog", language: "en", intent: intent(["opportunity"]), title: "Acme sued over data breach" });
    expect(risk.reasons.map((r) => r.code)).not.toContain("goal");
  });

  it("a goal word that is already a tracked keyword (or sits inside one) is not counted twice", () => {
    const tracked = scoreSignal({ ast: ast(["hibe"]), target: "topic", sourceType: "blog", language: "tr", intent: intent(["opportunity"]), title: "Yeni hibe programı" });
    expect(tracked.reasons.map((r) => r.code)).not.toContain("goal");
    const inside = scoreSignal({ ast: ast(["Kuluçka Merkezi"]), target: "company", sourceType: "blog", language: "tr", intent: intent(["opportunity"]), title: "Kuluçka Merkezi açıldı" });
    expect(inside.reasons.map((r) => r.code)).not.toContain("goal");
  });

  it("the person's own signal words work like a goal", () => {
    const signal = scoreSignal({ ast: ast(["Acme"]), target: "company", sourceType: "blog", language: "en", intent: intent(["coverage"], ["Q3 results"]), title: "Acme Q3 results beat forecasts" });
    expect(signal.reasons).toContainEqual({ code: "goal", goal: "custom", terms: ["Q3 results"], where: "headline" });
  });

  it("Turkish endings and abbreviations behave like they do in matching", () => {
    const signal = scoreSignal({ ast: ast(["Acme"]), target: "company", sourceType: "news", language: "tr", intent: intent(["opportunity"]), title: "Acme yeni hibelerden yararlandı" });
    expect(signal.reasons).toContainEqual({ code: "goal", goal: "opportunity", terms: ["hibe"], where: "headline" });
    // KVKK is an abbreviation: exact capitals.
    const policy = intent(["policy"]);
    const shout = scoreSignal({ ast: ast(["Acme"]), target: "company", sourceType: "blog", language: "tr", intent: policy, title: "Acme KVKK cezası aldı" });
    const quiet = scoreSignal({ ast: ast(["Acme"]), target: "company", sourceType: "blog", language: "tr", intent: policy, title: "Acme kvkk cezası aldı" });
    expect(shout.reasons.some((r) => r.code === "goal" && r.terms.includes("KVKK"))).toBe(true);
    expect(quiet.reasons.some((r) => r.code === "goal" && r.terms.includes("KVKK"))).toBe(false);
  });

  it("goal points are capped so a pile of words cannot bury the rest", () => {
    const stuffed = scoreSignal({
      ast: ast(["Acme"]),
      target: "company",
      sourceType: "blog",
      language: "en",
      intent: intent(["risk"]),
      title: "Acme crisis lawsuit scandal fraud boycott outage recall",
    });
    const single = scoreSignal({ ast: ast(["Acme"]), target: "company", sourceType: "blog", language: "en", intent: intent(["risk"]), title: "Acme crisis" });
    expect(stuffed.score - single.score).toBeLessThanOrEqual(24 - 12);
  });
});

describe("coverage", () => {
  const entity = { ast: ast(["Acme"]), target: "company", sourceType: "news", language: "en" } as const;

  it("a story many outlets carry climbs, a lone one does not", () => {
    const lead = scoreSignal({ ...entity, title: "Plant opens", lead: "Acme said so." });
    const covered3 = scoreSignal({ ...entity, title: "Plant opens", lead: "Acme said so.", outlets: 3 });
    const covered6 = scoreSignal({ ...entity, title: "Plant opens", lead: "Acme said so.", outlets: 6 });
    expect(covered3.score).toBe(lead.score + 10);
    expect(covered6.score).toBe(lead.score + 18);
    expect(covered3.reasons).toContainEqual({ code: "covered", n: 3 });
    expect(lead.reasons.map((r) => r.code)).not.toContain("covered");
  });

  it("a topic story carried by six outlets becomes important", () => {
    const topic = { ast: ast(["yatırım", "hibe"]), target: "topic", sourceType: "news", language: "tr" } as const;
    expect(scoreSignal({ ...topic, title: "Yatırım ve hibe" }).level).toBe("normal");
    expect(scoreSignal({ ...topic, title: "Yatırım ve hibe", outlets: 6 }).level).toBe("high");
  });

  it("applyCoverage recomputes instead of adding on top", () => {
    const alone = score({ title: "Plant", lead: "Acme said so." });
    const three = applyCoverage(alone, 3);
    const six = applyCoverage(three, 6);
    expect(three.score).toBe(alone.score + 10);
    expect(six.score).toBe(alone.score + 18);
    expect(applyCoverage(six, 6)).toEqual(six);
    const back = applyCoverage(six, 1);
    expect(back.score).toBe(alone.score);
    expect(back.reasons.map((r) => r.code)).not.toContain("covered");
    expect(applyCoverage(alone, 3).level).toBe(score({ title: "Plant", lead: "Acme said so.", outlets: 3 }).level);
  });

  it("the covered reason sits before the editorial one", () => {
    const withCoverage = applyCoverage(score({ title: "Acme opens" }), 4);
    expect(withCoverage.reasons.map((r) => r.code)).toEqual(["headline", "covered", "editorial"]);
  });
});

describe("levels", () => {
  it("are cut at fixed scores", () => {
    expect(HIGH_AT).toBe(60);
    expect(NORMAL_AT).toBe(30);
    expect(score({ title: "Acme" }).score).toBeGreaterThanOrEqual(HIGH_AT);
  });

  it("legacy labels", () => {
    expect(signalLevelLabel("high")).toBe("Important");
    expect(signalLevelLabel("critical")).toBe("Important");
    expect(signalLevelLabel("normal")).toBe("Worth a look");
    expect(signalLevelLabel("low")).toBe("Passing mention");
  });
});

describe("describeSignal", () => {
  it("tells the whole story in plain language", () => {
    const signal = scoreSignal({
      ast: ast(["Acme"]),
      target: "company",
      sourceType: "news",
      language: "en",
      intent: intent(["risk"]),
      title: "Acme sued over data breach",
      outlets: 4,
    });
    const description = describeSignal("high", signal.reasons)!;
    expect(description.label).toBe("Important");
    expect(description.lines).toEqual([
      "The headline names “Acme”",
      "Risks & crises: “sued”, “data breach” in the headline",
      "Reported by 4 outlets",
      "Published by a news outlet",
    ]);
    expect(description.short).toBe("The headline names “Acme” · Risks & crises: “sued”, “data breach” in the headline");
  });

  it("is null when nothing was scored", () => {
    expect(describeSignal("normal", null)).toBeNull();
    expect(describeSignal("normal", [])).toBeNull();
  });

  it("a deep mention says so", () => {
    expect(describeSignal("low", [{ code: "deep" }])!.short).toContain("deeper in the story");
  });
});

describe("the goal catalog", () => {
  it("has every goal once, plain coverage without words and the others with", () => {
    expect(SIGNAL_GOALS.map((goal) => goal.key)).toEqual([...GOAL_KEYS]);
    expect(goalWords("coverage")).toEqual([]);
    for (const goal of SIGNAL_GOALS.filter((g) => g.key !== "coverage")) {
      expect(goal.words.length, goal.key).toBeGreaterThanOrEqual(10);
    }
  });

  it("every word is a usable keyword and none repeats inside a goal", () => {
    for (const goal of SIGNAL_GOALS) {
      const keys = goal.words.map((word) => word.toLocaleLowerCase("tr-TR"));
      expect(new Set(keys).size, goal.key).toBe(keys.length);
      for (const word of goal.words) {
        expect(parseKeywordSpec(word).core.length, `${goal.key}: ${word}`).toBeGreaterThan(1);
        expect(word.length, `${goal.key}: ${word}`).toBeLessThanOrEqual(30);
      }
    }
  });
});
