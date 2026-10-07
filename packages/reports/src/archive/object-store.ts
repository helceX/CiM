import { createHash } from "node:crypto";
import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 over its S3-compatible API, signed with aws4fetch (a ~3 KB signer —
 * no AWS SDK). Archives live here instead of in Postgres so they never use the
 * database's disk. Nothing in the bucket is public: the app mints a short-lived
 * signed address after checking who is asking.
 */
export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export function r2ConfigFromEnv(env: Record<string, string | undefined>): R2Config | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return { accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET };
}

export class ObjectStore {
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(
    config: R2Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    this.base = `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}`;
  }

  /** Sign, then send through the injected fetch (so tests never touch the network). */
  private async send(url: string, init: RequestInit): Promise<Response> {
    return this.fetchImpl(await this.client.sign(url, init));
  }

  private urlFor(key: string): string {
    return `${this.base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async put(key: string, body: Uint8Array | string, contentType: string, downloadName?: string): Promise<void> {
    const headers: Record<string, string> = { "content-type": contentType };
    if (downloadName) headers["content-disposition"] = `attachment; filename="${downloadName.replace(/[^\w.\- ]/g, "_")}"`;
    const payload = typeof body === "string" ? new TextEncoder().encode(body) : body;
    const response = await this.send(this.urlFor(key), { method: "PUT", headers, body: payload as unknown as RequestInit["body"] });
    if (!response.ok) throw new Error(`Object storage refused the upload (HTTP ${response.status}).`);
  }

  /**
   * What the bucket reports for an object, or null when it does not exist. The check asks for the
   * stored bytes as they are ("identity") — a text file may otherwise be reported at its compressed
   * size — and passes on the ETag (an MD5 for a single upload) so the comparison does not depend on
   * the size alone.
   */
  async head(key: string): Promise<{ bytes: number; etag?: string } | null> {
    const response = await this.send(this.urlFor(key), { method: "HEAD", headers: { "accept-encoding": "identity" } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Object storage check failed (HTTP ${response.status}).`);
    const etag = response.headers.get("etag")?.replace(/^W\//, "").replace(/"/g, "").toLowerCase();
    return { bytes: Number(response.headers.get("content-length") ?? 0), ...(etag ? { etag } : {}) };
  }

  async delete(key: string): Promise<void> {
    const response = await this.send(this.urlFor(key), { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`Object storage refused the delete (HTTP ${response.status}).`);
  }

  /** A time-limited GET address (default 5 minutes). */
  async presignGet(key: string, expiresSeconds = 300): Promise<string> {
    const url = new URL(this.urlFor(key));
    url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
    const signed = await this.client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
    return signed.url;
  }
}

/** What an uploaded body is expected to look like when read back: its size and MD5. */
export function expectedStored(body: Uint8Array | string): { bytes: number; md5: string } {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  return { bytes: bytes.byteLength, md5: createHash("md5").update(bytes).digest("hex") };
}

/**
 * True when the bucket's copy is the one that was uploaded: the same MD5 ETag, or — when the bucket
 * reports none, or a different kind of tag — the same size.
 */
export function storedMatches(stored: { bytes: number; etag?: string }, expected: { bytes: number; md5: string }): boolean {
  return stored.etag === expected.md5 || stored.bytes === expected.bytes;
}
