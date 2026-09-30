import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { safeFetch, SsrfBlockedError } from "./safe-fetch";
import { isBlockedIp } from "./ssrf-guard";

/**
 * These exercise the real fetch machinery (redirect revalidation, size
 * cap, timeout) against a real local HTTP server — not mocked network
 * calls — since that's the only way to prove the plumbing actually works,
 * not just that the code compiles. The SSRF-rejection cases need no
 * `resolveHostname` override at all: "localhost"/"127.0.0.1" resolve to a
 * real loopback address on any machine, so they exercise the production
 * DNS path exactly as a real attacker-supplied Source URL would.
 *
 * The one legitimate case that can't be exercised this way is "a public
 * hostname was allowed and the fetch succeeded" — a real public DNS
 * record here would need live internet egress this suite shouldn't
 * depend on. `resolveHostname` is safeFetch's one test-only injection
 * point for exactly that: it stands in for "what a real DNS lookup of a
 * public hostname would return" while still exercising every other layer
 * (the pinned-IP connect, response reading, size cap) unmodified from
 * production. The IP-safety decision itself is covered exhaustively,
 * without any DI, in ssrf-guard.test.ts.
 */

let servers: http.Server[] = [];

function listen(
  handler: http.RequestListener,
): Promise<{ port: number; server: http.Server }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    servers.push(server);
    server.listen(0, "127.0.0.1", () => {
      resolve({ port: (server.address() as AddressInfo).port, server });
    });
  });
}

afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
  servers = [];
});

/**
 * Stands in for "what a real DNS lookup would return" — the fixed test
 * hostname resolves to our local server, but anything else (e.g. a
 * redirect Location pointing at a literal IP) is still validated for
 * real via `isBlockedIp`, exactly like the production resolver. This is
 * what lets the "rejects a redirect to a blocked address" test prove
 * safeFetch's redirect hop re-validates, rather than trusting the first
 * hop's override for every subsequent one.
 */
function loopbackResolver() {
  return async (hostname: string) => {
    if (hostname === "example-cim-test.invalid")
      return { address: "127.0.0.1", family: 4 };
    if (isBlockedIp(hostname)) {
      throw new SsrfBlockedError(`Blocked address: ${hostname}`);
    }
    return { address: hostname, family: 4 };
  };
}

describe("safeFetch — SSRF rejection (real DNS, no mocking)", () => {
  it("rejects localhost before ever connecting", async () => {
    let hit = false;
    const { port } = await listen((_req, res) => {
      hit = true;
      res.end("should never be reached");
    });
    await expect(safeFetch(`http://localhost:${port}/`)).rejects.toThrow(
      SsrfBlockedError,
    );
    expect(hit).toBe(false);
  });

  it("rejects a literal 127.0.0.1 URL", async () => {
    await expect(safeFetch("http://127.0.0.1:1/")).rejects.toThrow(SsrfBlockedError);
  });

  it("rejects a literal private RFC1918 address", async () => {
    await expect(safeFetch("http://10.1.2.3/")).rejects.toThrow(SsrfBlockedError);
  });

  it("rejects the cloud metadata address", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it("rejects a literal bracketed IPv6 loopback URL through the real SSRF classifier, not a generic DNS failure", async () => {
    // URL#hostname keeps the brackets ("[::1]") for an IPv6 literal;
    // dns.lookup doesn't accept them. Unless safeFetch strips them
    // before resolving, this fails with a plain ENOTFOUND instead of
    // ever reaching ssrf-guard's IPv6 blocklist — this proves it's
    // actually classified and blocked, not just failing for the wrong
    // reason.
    await expect(safeFetch("http://[::1]:1/")).rejects.toThrow(SsrfBlockedError);
  });

  it("rejects a non-HTTP(S) protocol", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toThrow(SsrfBlockedError);
  });

  it("rejects a redirect hop that points at a blocked address", async () => {
    const { port } = await listen((_req, res) => {
      res.writeHead(302, { Location: "http://169.254.169.254/secret" });
      res.end();
    });
    await expect(
      safeFetch(`http://example-cim-test.invalid:${port}/`, {
        resolveHostname: loopbackResolver(),
      }),
    ).rejects.toThrow(SsrfBlockedError);
  });
});

describe("safeFetch — fetch machinery (via injected resolver)", () => {
  it("fetches a real 200 response end to end", async () => {
    const { port } = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello from the test server");
    });
    const result = await safeFetch(`http://example-cim-test.invalid:${port}/`, {
      resolveHostname: loopbackResolver(),
    });
    expect(result.status).toBe(200);
    expect(result.body).toBe("hello from the test server");
  });

  it("follows a same-server redirect and revalidates the new hop", async () => {
    const { port } = await listen((req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, {
          Location: `http://example-cim-test.invalid:${port}/final`,
        });
        res.end();
        return;
      }
      res.writeHead(200);
      res.end("final destination");
    });
    const result = await safeFetch(`http://example-cim-test.invalid:${port}/start`, {
      resolveHostname: loopbackResolver(),
    });
    expect(result.status).toBe(200);
    expect(result.body).toBe("final destination");
    expect(result.finalUrl).toContain("/final");
  });

  it("gives up after too many redirects", async () => {
    const { port } = await listen((_req, res) => {
      res.writeHead(302, { Location: `http://example-cim-test.invalid:${port}/loop` });
      res.end();
    });
    await expect(
      safeFetch(`http://example-cim-test.invalid:${port}/loop`, {
        resolveHostname: loopbackResolver(),
        maxRedirects: 2,
      }),
    ).rejects.toThrow(SsrfBlockedError);
  });

  it("aborts a response that exceeds the byte cap", async () => {
    const { port } = await listen((_req, res) => {
      res.writeHead(200);
      res.end("x".repeat(1000));
    });
    await expect(
      safeFetch(`http://example-cim-test.invalid:${port}/`, {
        resolveHostname: loopbackResolver(),
        maxResponseBytes: 100,
      }),
    ).rejects.toThrow(SsrfBlockedError);
  });

  /**
   * A regression test for a real hang: undici's Agent#close() waits for
   * any in-flight request to drain, and a response body stream that's
   * still delivering bytes counts as in-flight even after fetch()
   * itself has resolved (which only means headers arrived). Every
   * fixture above is small enough (≤1000 bytes) to arrive in a single
   * TCP segment before any read() call, so none of them ever exercised
   * real backpressure — this uses a body large enough that it can't
   * possibly still be fully buffered by the time the first chunk is
   * read, which is what actually reproduces the hang if the body isn't
   * drained (via a full read, or reader.cancel()) before the agent
   * closes. Bounded by the test's own timeout below: this test failing
   * by timing out, not by a thrown error, is exactly what a regression
   * here would look like.
   */
  it("reads a large streamed response without hanging on agent close", async () => {
    const bigBody = Buffer.alloc(8 * 1024 * 1024, "a"); // 8 MB
    const { port } = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(bigBody);
    });
    const result = await safeFetch(`http://example-cim-test.invalid:${port}/`, {
      resolveHostname: loopbackResolver(),
      maxResponseBytes: bigBody.length + 1,
    });
    expect(result.status).toBe(200);
    expect(result.body.length).toBe(bigBody.length);
  }, 8000);

  it("aborts a large streamed response that exceeds the byte cap without hanging", async () => {
    const bigBody = Buffer.alloc(8 * 1024 * 1024, "a"); // 8 MB, cap trips mid-stream
    const { port } = await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(bigBody);
    });
    await expect(
      safeFetch(`http://example-cim-test.invalid:${port}/`, {
        resolveHostname: loopbackResolver(),
        maxResponseBytes: 1024 * 1024,
      }),
    ).rejects.toThrow(SsrfBlockedError);
  }, 8000);

  it("sends a POST with a body through the same SSRF-guarded path (webhook delivery)", async () => {
    let receivedMethod: string | undefined;
    let receivedBody = "";
    const { port } = await listen((req, res) => {
      receivedMethod = req.method;
      req.on("data", (chunk) => (receivedBody += chunk));
      req.on("end", () => {
        res.writeHead(200);
        res.end("ok");
      });
    });
    const result = await safeFetch(`http://example-cim-test.invalid:${port}/`, {
      resolveHostname: loopbackResolver(),
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });
    expect(result.status).toBe(200);
    expect(receivedMethod).toBe("POST");
    expect(receivedBody).toBe('{"hello":"world"}');
  });
});
