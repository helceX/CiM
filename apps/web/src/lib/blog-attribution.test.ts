import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { blogAttribution, sealBlogAttribution } = await import("./blog-attribution");
const { sealLoginValue, openLoginValue } = await import("./federated-login");
const secret = "s".repeat(40);
const measurementSecret = `blog-attribution:${secret}`;
describe("blog acquisition boundary", () => {
  it("accepts only an encrypted, current catalog source and returns aggregate metadata", () => {
    const token = sealLoginValue({ blogSource: "medya-takibi-nedir", expires: Date.now() + 60000, email: "private@example.com" }, measurementSecret);
    expect(blogAttribution(token, secret)).toEqual({ acquisition: { channel: "blog", slug: "medya-takibi-nedir" } });
    expect(blogAttribution(token, "other")).toBeUndefined();
    expect(blogAttribution(token + "tampered", secret)).toBeUndefined();
  });
  it("ignores expired, malformed and unknown sources without blocking signup", () => {
    for (const value of [null, {}, "raw-slug", sealLoginValue({ blogSource: "unknown", expires: Date.now() + 60000 }, measurementSecret), sealLoginValue({ blogSource: "medya-takibi-nedir", expires: 1 }, measurementSecret)]) expect(blogAttribution(value, secret)).toBeUndefined();
  });
  it("measures the blog library separately from individual articles", () => {
    const token = sealBlogAttribution("blog-library", secret);
    expect(blogAttribution(token, secret)).toEqual({ acquisition: { channel: "blog", slug: "blog-library" } });
  });
  it("keeps public measurement tokens cryptographically separate from login identity cookies", () => {
    expect(openLoginValue(sealBlogAttribution("medya-takibi-nedir", secret), secret)).toBeNull();
    expect(blogAttribution(sealLoginValue({ blogSource: "medya-takibi-nedir", expires: Date.now() + 60000 }, secret), secret)).toBeUndefined();
  });
});
