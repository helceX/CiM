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
});
