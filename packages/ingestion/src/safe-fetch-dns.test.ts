import dns from "node:dns";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pinnedLookup, resolveValidatedIp, SsrfBlockedError } from "./safe-fetch";

afterEach(() => vi.restoreAllMocks());

function answers(addresses: dns.LookupAddress[]) {
  vi.spyOn(dns, "lookup").mockImplementation(((
    _hostname: string,
    _options: unknown,
    callback: (error: Error | null, results: dns.LookupAddress[]) => void,
  ) => {
    queueMicrotask(() => callback(null, addresses));
  }) as typeof dns.lookup);
}

describe("validated network address selection", () => {
  it("prefers public IPv4 after validating an IPv6-first DNS answer", async () => {
    answers([
      { address: "2001:4860:4860::8888", family: 6 },
      { address: "8.8.8.8", family: 4 },
    ]);
    await expect(resolveValidatedIp("feed.example")).resolves.toEqual({
      address: "8.8.8.8",
      family: 4,
    });
  });

  it.each([
    [
      { address: "8.8.8.8", family: 4 },
      { address: "::1", family: 6 },
    ],
    [
      { address: "2001:4860:4860::8888", family: 6 },
      { address: "10.0.0.1", family: 4 },
    ],
  ])(
    "rejects the entire DNS answer when any address is private",
    async (...records) => {
      answers(records);
      await expect(resolveValidatedIp("feed.example")).rejects.toThrow(
        SsrfBlockedError,
      );
    },
  );

  it("retains a validated public IPv6-only address", async () => {
    answers([{ address: "2001:4860:4860::8888", family: 6 }]);
    await expect(resolveValidatedIp("feed.example")).resolves.toEqual({
      address: "2001:4860:4860::8888",
      family: 6,
    });
  });

  it("rejects an empty DNS answer", async () => {
    answers([]);
    await expect(resolveValidatedIp("feed.example")).rejects.toThrow(SsrfBlockedError);
  });
});

describe("pinned connector lookup", () => {
  it.each([false, true])(
    "completes asynchronously for all=%s without another DNS lookup",
    async (all) => {
      const callback = vi.fn();
      const lookup = vi.spyOn(dns, "lookup");
      pinnedLookup({ address: "8.8.8.8", family: 4 })(
        "feed.example",
        { all },
        callback,
      );
      expect(callback).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(callback).toHaveBeenCalledExactlyOnceWith(
        ...(all ? [null, [{ address: "8.8.8.8", family: 4 }]] : [null, "8.8.8.8", 4]),
      );
      expect(lookup).not.toHaveBeenCalled();
    },
  );
});
