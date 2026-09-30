import { describe, expect, it } from "vitest";
import { isSameOrigin, type OriginInput } from "./same-origin";

const base: OriginInput = {
  origin: null,
  referer: null,
  host: "mediaory.io",
  forwardedHost: null,
  forwardedProto: "https",
  // What Next's standalone server reports when started with HOSTNAME=0.0.0.0.
  nextOrigin: "http://0.0.0.0:3000",
  appUrl: "https://mediaory.io",
};

describe("isSameOrigin behind a TLS-terminating proxy", () => {
  it("accepts the public origin even though nextUrl.origin is 0.0.0.0", () => {
    expect(isSameOrigin({ ...base, origin: "https://mediaory.io" })).toBe(true);
  });

  it("accepts it when only the forwarded headers describe the public host", () => {
    expect(
      isSameOrigin({
        ...base,
        appUrl: undefined,
        host: "internal:3000",
        forwardedHost: "mediaory.io",
        origin: "https://mediaory.io",
      }),
    ).toBe(true);
  });

  it("takes the first entry of comma-separated forwarded headers", () => {
    expect(
      isSameOrigin({
        ...base,
        appUrl: undefined,
        forwardedHost: "mediaory.io, cdn.example",
        forwardedProto: "https, http",
        origin: "https://mediaory.io",
      }),
    ).toBe(true);
  });

  it("accepts the local dev origin from Host when no proxy is involved", () => {
    expect(
      isSameOrigin({
        origin: "http://localhost:3000",
        referer: null,
        host: "localhost:3000",
        forwardedHost: null,
        forwardedProto: null,
        nextOrigin: "http://0.0.0.0:3000",
        appUrl: undefined,
      }),
    ).toBe(true);
  });

  it("falls back to the Referer when Origin is absent", () => {
    expect(isSameOrigin({ ...base, referer: "https://mediaory.io/login" })).toBe(true);
  });
});

describe("isSameOrigin still rejects cross-site requests", () => {
  it("rejects a different origin", () => {
    expect(isSameOrigin({ ...base, origin: "https://evil.example" })).toBe(false);
  });

  it("rejects a different scheme on the same host", () => {
    expect(isSameOrigin({ ...base, origin: "http://mediaory.io" })).toBe(false);
  });

  it("rejects a lookalike subdomain or suffix", () => {
    expect(isSameOrigin({ ...base, origin: "https://mediaory.io.evil.example" })).toBe(false);
    expect(isSameOrigin({ ...base, origin: "https://evil.mediaory.io" })).toBe(false);
  });

  it("rejects a Referer from another site", () => {
    expect(isSameOrigin({ ...base, referer: "https://evil.example/page" })).toBe(false);
  });

  it("fails closed with neither Origin nor Referer, or a malformed Referer", () => {
    expect(isSameOrigin(base)).toBe(false);
    expect(isSameOrigin({ ...base, referer: "not a url" })).toBe(false);
  });

  it("ignores a malformed APP_URL rather than throwing", () => {
    expect(isSameOrigin({ ...base, appUrl: "::::", origin: "https://mediaory.io" })).toBe(true);
    expect(isSameOrigin({ ...base, appUrl: "::::", origin: "https://evil.example" })).toBe(false);
  });
});
