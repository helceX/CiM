import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { blogAttribution } = await import("./blog-attribution");
const { sealLoginValue } = await import("./federated-login");
const secret = "s".repeat(40);
describe("blog acquisition boundary", () => {
  it("accepts only an encrypted, current catalog source and returns aggregate metadata", () => {
    const token = sealLoginValue({ blogSource: "medya-takibi-nedir", expires: Date.now() + 60000, email: "private@example.com" }, secret);
    expect(blogAttribution(token, secret)).toEqual({ acquisition: { channel: "blog", slug: "medya-takibi-nedir" } });
    expect(blogAttribution(token, "other")).toBeUndefined();
    expect(blogAttribution(token + "tampered", secret)).toBeUndefined();
  });
  it("ignores expired, malformed and unknown sources without blocking signup", () => {
    for (const value of [null, {}, "raw-slug", sealLoginValue({ blogSource: "unknown", expires: Date.now() + 60000 }, secret), sealLoginValue({ blogSource: "medya-takibi-nedir", expires: 1 }, secret)]) expect(blogAttribution(value, secret)).toBeUndefined();
  });
  it("measures the blog library separately from individual articles", () => {
    const token = sealLoginValue({ blogSource: "blog-library", expires: Date.now() + 60000 }, secret);
    expect(blogAttribution(token, secret)).toEqual({ acquisition: { channel: "blog", slug: "blog-library" } });
  });
});
