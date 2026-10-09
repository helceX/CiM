import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgContext = vi.fn();
const listStoriesForPreview = vi.fn();

vi.mock("@/lib/tenant", () => ({ requireOrgContext: (...args: unknown[]) => requireOrgContext(...args) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 1 }) }));
vi.mock("@cim/ai", () => ({ getAIProvider: () => null }));
vi.mock("@cim/config", () => ({ getEnv: () => ({}) }));
vi.mock("@cim/db", () => ({
  db: {},
  listStoriesForPreview: (...args: unknown[]) => listStoriesForPreview(...args),
}));

const { POST } = await import("./route");

const story = (id: string, title: string, storedExcerpt: string | null, minutesAgo: number) => ({
  id,
  title,
  storedExcerpt,
  wordFingerprint: null,
  language: "en",
  publishedAt: null,
  fetchedAt: new Date(Date.now() - minutesAgo * 60_000),
  sourceName: "Daily Wire",
  sourceType: "news",
  sourceCountry: "TR",
});

const request = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/monitoring/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  requireOrgContext.mockResolvedValue({ organizationId: "org-1" });
  listStoriesForPreview.mockResolvedValue({
    stories: [
      story("1", "Acme sued over data breach", "Short.", 30),
      story("2", "Plant opens in Izmir", "Acme said on Monday that the plant opens.", 20),
      story("3", "Weekly roundup", `${"background ".repeat(20)} Acme was mentioned once.`, 10),
      story("4", "Unrelated headline", "Nothing here.", 5),
    ],
    scanned: 4,
    scannedSince: new Date(),
    windowDays: 30,
  });
});

describe("POST /api/monitoring/preview — how much would matter", () => {
  it("splits the matches by importance for what the person is looking for and says why the top ones rank", async () => {
    const response = await POST(
      request({ include: ["Acme"], trackingTarget: "company", intent: { goals: ["risk"], focus: "essentials", signalWords: [] } }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.matchCount).toBe(3);
    expect(body.levels).toEqual({ high: 1, normal: 1, low: 1 });
    expect(body.top).toHaveLength(3);
    expect(body.top[0]).toMatchObject({ title: "Acme sued over data breach", level: "high" });
    expect(body.top[0].why).toContain("The headline names “Acme”");
    expect(body.top[0].why).toContain("Risks & crises");
    expect(body.top[2]).toMatchObject({ title: "Weekly roundup", level: "low" });
  });

  it("without goals the same stories still rank by where the name is", async () => {
    const body = await (await POST(request({ include: ["Acme"], trackingTarget: "company" }))).json();
    expect(body.levels).toEqual({ high: 1, normal: 1, low: 1 });
    expect(body.top[0].why).not.toContain("Risks");
  });

  it("treats a topic differently from a name", async () => {
    const body = await (await POST(request({ include: ["Acme"], trackingTarget: "topic" }))).json();
    // A subject's word in a headline is worth a look, not important.
    expect(body.levels.high).toBe(0);
  });

  it("needs a session", async () => {
    requireOrgContext.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
    expect((await POST(request({ include: ["Acme"] }))).status).toBe(401);
  });
});
