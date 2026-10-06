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

  /** The stored size in bytes, or null when the object does not exist. */
  async head(key: string): Promise<{ bytes: number } | null> {
    const response = await this.send(this.urlFor(key), { method: "HEAD" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Object storage check failed (HTTP ${response.status}).`);
    return { bytes: Number(response.headers.get("content-length") ?? 0) };
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
