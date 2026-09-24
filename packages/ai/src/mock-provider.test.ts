import { describe, expect, it } from "vitest";
import { MockAIProvider } from "./mock-provider";

describe("MockAIProvider", () => {
  const provider = new MockAIProvider();

  it("classifies positive sentiment from lexicon hits and labels its method honestly", async () => {
    const result = await provider.classifySentiment({
      title: "Northwind Atlas wins industry award",
      text: "Analysts praised the strong growth and record results.",
    });
    expect(result.sentiment).toBe("positive");
    expect(result.method).toBe("mock-heuristic-v1");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("classifies negative sentiment from lexicon hits", async () => {
    const result = await provider.classifySentiment({
      title: "Northwind Atlas faces lawsuit over recall",
      text: "The company issued a recall after customer complaints and a lawsuit was filed.",
    });
    expect(result.sentiment).toBe("negative");
  });

  it("classifies neutral sentiment with low confidence when no lexicon terms hit", async () => {
    const result = await provider.classifySentiment({
      title: "Northwind Atlas holds quarterly meeting",
      text: "Representatives gathered to discuss the schedule.",
    });
    expect(result.sentiment).toBe("neutral");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("extracts capitalized entity names from the title, never a lowercase word", async () => {
    const result = await provider.extractEntities({
      title: "Northwind Atlas expands into new region",
      text: "The expansion follows strong demand.",
    });
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.entities[0]?.name).toBe("Northwind Atlas");
    expect(result.method).toBe("mock-heuristic-v1");
  });

  it("detects topics only when their vocabulary actually appears, never a guess", async () => {
    const result = await provider.detectTopics({
      title: "Northwind Atlas announces quarterly earnings",
      text: "Revenue and profit both rose this quarter.",
    });
    expect(result.topics.some((t) => t.name === "Financial")).toBe(true);
  });

  it("returns no topics when nothing in the fixed vocabulary matches", async () => {
    const result = await provider.detectTopics({
      title: "A quiet Tuesday",
      text: "Nothing of note happened.",
    });
    expect(result.topics).toEqual([]);
  });

  it("generates an extractive summary grounded in the real title and text", async () => {
    const result = await provider.generateSummary({
      title: "Northwind Atlas launches new product",
      text: "The launch event was held on Tuesday. Attendees included press and partners.",
    });
    expect(result.summary).toContain("Northwind Atlas launches new product");
    expect(result.method).toBe("mock-heuristic-v1");
  });

  it("generates a grounded insight whose evidence is exactly the mentions it was given", async () => {
    const result = await provider.generateInsight({
      periodLabel: "the last 24 hours",
      mentions: [
        {
          id: "m1",
          title: "A",
          sourceName: "Wire",
          sentiment: "positive",
          priority: "normal",
          publishedAt: null,
        },
        {
          id: "m2",
          title: "B",
          sourceName: "Wire",
          sentiment: "negative",
          priority: "high",
          publishedAt: null,
        },
      ],
    });
    expect(result.evidenceMentionIds.sort()).toEqual(["m1", "m2"]);
    expect(result.summary).toMatch(/2 new mentions/);
    expect(result.summary).toMatch(/1 positive, 1 negative/);
    expect(result.summary).toMatch(/1 high-priority/);
  });

  it("refuses to generate an insight with zero mentions rather than fabricate one", async () => {
    await expect(
      provider.generateInsight({ periodLabel: "today", mentions: [] }),
    ).rejects.toThrow();
  });

  describe("generateRecommendations", () => {
    it("recommends addressing negative coverage when enough of it appears, grounded in exactly those mentions", async () => {
      const result = await provider.generateRecommendations({
        periodLabel: "the last 24 hours",
        mentions: [
          { id: "m1", title: "A", sourceName: "Wire", sentiment: "negative", priority: "normal", publishedAt: null },
          { id: "m2", title: "B", sourceName: "Wire", sentiment: "negative", priority: "normal", publishedAt: null },
          { id: "m3", title: "C", sourceName: "Wire", sentiment: "positive", priority: "normal", publishedAt: null },
        ],
      });
      expect(result.method).toBe("mock-heuristic-v1");
      const negativeRec = result.recommendations.find((r) => r.recommendation.includes("negative"));
      expect(negativeRec).toBeDefined();
      expect(negativeRec?.evidenceMentionIds.sort()).toEqual(["m1", "m2"]);
      expect(negativeRec?.why).toMatch(/2 of the 3 mentions/);
    });

    it("recommends reviewing high-priority mentions when any appear", async () => {
      const result = await provider.generateRecommendations({
        periodLabel: "the last 24 hours",
        mentions: [
          { id: "m1", title: "A", sourceName: "Wire", sentiment: "neutral", priority: "critical", publishedAt: null },
        ],
      });
      const highPriorityRec = result.recommendations.find((r) => r.evidenceMentionIds.includes("m1"));
      expect(highPriorityRec).toBeDefined();
      expect(highPriorityRec?.priority).toBe("medium");
    });

    it("returns no recommendations rather than fabricate one when nothing stands out", async () => {
      const result = await provider.generateRecommendations({
        periodLabel: "the last 24 hours",
        mentions: [
          { id: "m1", title: "A", sourceName: "Wire", sentiment: "positive", priority: "normal", publishedAt: null },
          { id: "m2", title: "B", sourceName: "Wire", sentiment: "neutral", priority: "normal", publishedAt: null },
        ],
      });
      expect(result.recommendations).toEqual([]);
    });
  });

  describe("detectRisk", () => {
    it("flags critical risk when a critical-priority mention appears alongside a majority-negative period", async () => {
      const result = await provider.detectRisk({
        periodLabel: "the last 24 hours",
        mentions: [
          { id: "m1", title: "A", sourceName: "Wire", sentiment: "negative", priority: "critical", publishedAt: null },
          { id: "m2", title: "B", sourceName: "Wire", sentiment: "negative", priority: "normal", publishedAt: null },
          { id: "m3", title: "C", sourceName: "Wire", sentiment: "positive", priority: "normal", publishedAt: null },
        ],
      });
      expect(result.method).toBe("mock-heuristic-v1");
      expect(result.risk?.level).toBe("critical");
      expect(result.risk?.evidenceMentionIds).toEqual(["m1"]);
    });

    it("flags high risk from a strong negative majority without a critical-priority mention", async () => {
      const result = await provider.detectRisk({
        periodLabel: "the last 24 hours",
        mentions: [
          { id: "m1", title: "A", sourceName: "Wire", sentiment: "negative", priority: "normal", publishedAt: null },
          { id: "m2", title: "B", sourceName: "Wire", sentiment: "negative", priority: "normal", publishedAt: null },
          { id: "m3", title: "C", sourceName: "Wire", sentiment: "negative", priority: "normal", publishedAt: null },
          { id: "m4", title: "D", sourceName: "Wire", sentiment: "positive", priority: "normal", publishedAt: null },
        ],
      });
      expect(result.risk?.level).toBe("high");
      expect(result.risk?.evidenceMentionIds.sort()).toEqual(["m1", "m2", "m3"]);
    });

    it("flags medium risk from a moderate negative share", async () => {
      const result = await provider.detectRisk({
        periodLabel: "the last 24 hours",
        mentions: [
          { id: "m1", title: "A", sourceName: "Wire", sentiment: "negative", priority: "normal", publishedAt: null },
          { id: "m2", title: "B", sourceName: "Wire", sentiment: "negative", priority: "normal", publishedAt: null },
          { id: "m3", title: "C", sourceName: "Wire", sentiment: "neutral", priority: "normal", publishedAt: null },
          { id: "m4", title: "D", sourceName: "Wire", sentiment: "positive", priority: "normal", publishedAt: null },
          { id: "m5", title: "E", sourceName: "Wire", sentiment: "positive", priority: "normal", publishedAt: null },
        ],
      });
      expect(result.risk?.level).toBe("medium");
    });

    it("never cites a critical-priority positive mention as evidence for a claim that's entirely about negative coverage", async () => {
      // Regression: evidence previously came from *any* critical-priority
      // mention regardless of sentiment, so a critical-priority positive
      // article could be cited as "evidence" for a summary that's
      // exclusively about negative sentiment.
      const result = await provider.detectRisk({
        periodLabel: "the last 24 hours",
        mentions: [
          { id: "m1", title: "Positive but critical-priority", sourceName: "Wire", sentiment: "positive", priority: "critical", publishedAt: null },
          { id: "m2", title: "Negative, normal priority", sourceName: "Wire", sentiment: "negative", priority: "normal", publishedAt: null },
          { id: "m3", title: "Negative, critical priority", sourceName: "Wire", sentiment: "negative", priority: "critical", publishedAt: null },
          { id: "m4", title: "Positive, normal priority", sourceName: "Wire", sentiment: "positive", priority: "normal", publishedAt: null },
        ],
      });
      expect(result.risk?.level).toBe("critical");
      expect(result.risk?.evidenceMentionIds).toEqual(["m3"]);
    });

    it("does not flag critical risk from a single critical-priority negative mention alone", async () => {
      // Regression: the "critical" branch had no minimum negative-mention
      // count, so one data point could trigger the highest risk level
      // while "medium" required 2 and "high" required 3.
      const result = await provider.detectRisk({
        periodLabel: "the last 24 hours",
        mentions: [
          { id: "m1", title: "A", sourceName: "Wire", sentiment: "negative", priority: "critical", publishedAt: null },
        ],
      });
      expect(result.risk).toBeNull();
    });

    it("flags no risk rather than fabricate a 'low risk, all clear' claim when coverage is mostly positive", async () => {
      const result = await provider.detectRisk({
        periodLabel: "the last 24 hours",
        mentions: [
          { id: "m1", title: "A", sourceName: "Wire", sentiment: "negative", priority: "normal", publishedAt: null },
          { id: "m2", title: "B", sourceName: "Wire", sentiment: "positive", priority: "normal", publishedAt: null },
          { id: "m3", title: "C", sourceName: "Wire", sentiment: "positive", priority: "normal", publishedAt: null },
          { id: "m4", title: "D", sourceName: "Wire", sentiment: "positive", priority: "normal", publishedAt: null },
          { id: "m5", title: "E", sourceName: "Wire", sentiment: "neutral", priority: "normal", publishedAt: null },
        ],
      });
      expect(result.risk).toBeNull();
    });
  });

  describe("answerQuestion", () => {
    const mentions = [
      {
        id: "m1",
        title: "Northwind launches new product",
        sourceName: "Daily Tech Wire",
        sentiment: "positive" as const,
        priority: "normal" as const,
        publishedAt: null,
      },
      {
        id: "m2",
        title: "Unrelated regional weather report",
        sourceName: "Local Gazette",
        sentiment: "neutral" as const,
        priority: "low" as const,
        publishedAt: null,
      },
    ];

    it("grounds its answer only in mentions whose text overlaps the question", async () => {
      const result = await provider.answerQuestion({
        question: "What's happening with our product launch?",
        screenContext: "Viewing the Dashboard",
        history: [],
        mentions,
      });
      expect(result.evidenceMentionIds).toEqual(["m1"]);
      expect(result.answer).toContain("Northwind launches new product");
      expect(result.method).toBe("mock-heuristic-v1");
    });

    it("cites no evidence and says so when nothing matches", async () => {
      const result = await provider.answerQuestion({
        question: "What is our competitor's stock price?",
        screenContext: "Viewing the Dashboard",
        history: [],
        mentions,
      });
      expect(result.evidenceMentionIds).toEqual([]);
      expect(result.answer).toMatch(/couldn't find/i);
    });

    it("says there is nothing to check when there are no mentions at all", async () => {
      const result = await provider.answerQuestion({
        question: "Anything new?",
        screenContext: "Viewing the Dashboard",
        history: [],
        mentions: [],
      });
      expect(result.evidenceMentionIds).toEqual([]);
      expect(result.answer).toMatch(/nothing has been crawled/i);
    });

    it("falls back to the previous turn's topic when a short follow-up has no keywords of its own", async () => {
      const result = await provider.answerQuestion({
        question: "What about that?",
        screenContext: "Viewing the Dashboard",
        history: [{ question: "What's happening with our product launch?", answer: "..." }],
        mentions,
      });
      expect(result.evidenceMentionIds).toEqual(["m1"]);
    });

    it("does not fall back to history when the question alone already matches", async () => {
      const result = await provider.answerQuestion({
        question: "Anything about the weather report?",
        screenContext: "Viewing the Dashboard",
        history: [{ question: "What's happening with our product launch?", answer: "..." }],
        mentions,
      });
      expect(result.evidenceMentionIds).toEqual(["m2"]);
    });

    it("caps the answer at 1200 characters, matching assistantAnswerOutputSchema's own max", async () => {
      // Regression: this path builds `answer` by concatenating up to 5
      // mention titles/source names with no cap — unlike the Anthropic
      // path, which is bounded by schema validation at the source. An
      // uncapped answer here gets echoed back as `history` on the next
      // question (apps/web's AiAssistantPanel), and
      // conversationTurnSchema's own answer field caps at 1200 too —
      // permanently stalling the conversation with a 400 on the very
      // next, perfectly valid question.
      const longTitleMentions = Array.from({ length: 5 }, (_, i) => ({
        id: `m${i}`,
        title: `Northwind quarterly results coverage ${"word ".repeat(60)}${i}`,
        sourceName: "Daily Tech Wire",
        sentiment: "positive" as const,
        priority: "normal" as const,
        publishedAt: null,
      }));

      const result = await provider.answerQuestion({
        question: "What's happening with Northwind?",
        screenContext: "Viewing the Dashboard",
        history: [],
        mentions: longTitleMentions,
      });
      expect(result.answer.length).toBeLessThanOrEqual(1200);
    });
  });

  describe("reviewQuery", () => {
    it("flags a zero-match query as possibly too narrow", async () => {
      const result = await provider.reviewQuery({
        booleanQuery: "\"a very specific phrase\"",
        windowDays: 30,
        matchCount: 0,
        sample: [],
      });
      expect(result.assessment).toMatch(/too narrow|nothing/i);
      expect(result.method).toBe("mock-heuristic-v1");
    });

    it("flags a high-volume query as possibly too broad", async () => {
      const result = await provider.reviewQuery({
        booleanQuery: "news",
        windowDays: 7,
        matchCount: 200,
        sample: [{ title: "Something", sourceName: "Wire" }],
      });
      expect(result.assessment).toMatch(/broad/i);
    });

    it("gives a neutral assessment for a reasonable match volume", async () => {
      const result = await provider.reviewQuery({
        booleanQuery: "Northwind Atlas",
        windowDays: 30,
        matchCount: 4,
        sample: [
          { title: "Northwind Atlas launches product", sourceName: "Daily Tech Wire" },
          { title: "Northwind Atlas quarterly results", sourceName: "Business Times" },
        ],
      });
      expect(result.assessment).toMatch(/matched 4 results?/i);
    });
  });
});
