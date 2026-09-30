import { describe, expect, it } from "vitest";
import { assertProtocolIsFetchable, isBlockedIp, SsrfBlockedError } from "./ssrf-guard";

describe("isBlockedIp", () => {
  it.each([
    ["127.0.0.1", "IPv4 loopback"],
    ["127.255.255.255", "IPv4 loopback range"],
    ["10.0.0.1", "RFC1918 10/8"],
    ["10.255.255.255", "RFC1918 10/8 upper bound"],
    ["172.16.0.1", "RFC1918 172.16/12 lower bound"],
    ["172.31.255.255", "RFC1918 172.16/12 upper bound"],
    ["192.168.0.1", "RFC1918 192.168/16"],
    ["169.254.169.254", "cloud metadata endpoint"],
    ["169.254.0.1", "link-local"],
    ["0.0.0.0", "this-network"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast/reserved"],
    ["::1", "IPv6 loopback"],
    ["fe80::1", "IPv6 link-local"],
    ["fc00::1", "IPv6 unique local (fc)"],
    ["fd00::1", "IPv6 unique local (fd)"],
    ["::ffff:127.0.0.1", "IPv4-mapped IPv6 loopback"],
    ["::ffff:169.254.169.254", "IPv4-mapped IPv6 metadata"],
    ["not-an-ip", "garbage input fails closed"],
    ["", "empty input fails closed"],
  ])("blocks %s (%s)", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    ["8.8.8.8", "public IPv4 (Google DNS)"],
    ["93.184.216.34", "public IPv4 (example.com)"],
    ["172.15.255.255", "just below RFC1918 172.16/12"],
    ["172.32.0.0", "just above RFC1918 172.16/12"],
    ["11.0.0.1", "just above RFC1918 10/8"],
    ["2606:4700:4700::1111", "public IPv6 (Cloudflare DNS)"],
  ])("allows %s (%s)", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe("assertProtocolIsFetchable", () => {
  it("allows http and https", () => {
    expect(() => assertProtocolIsFetchable(new URL("http://example.com"))).not.toThrow();
    expect(() => assertProtocolIsFetchable(new URL("https://example.com"))).not.toThrow();
  });

  it.each(["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com", "data:text/plain,hi"])(
    "blocks %s",
    (url) => {
      expect(() => assertProtocolIsFetchable(new URL(url))).toThrow(SsrfBlockedError);
    },
  );
});
