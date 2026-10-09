import type Redis from "ioredis";
import {
  CRAWL_STATS_TTL_SECONDS,
  crawlStatsKey,
  type CrawlStatField,
} from "@cim/core";

/**
 * What a crawl remembers about one source between crawls (a few hundred bytes), kept in Redis — not in Postgres, so
 * remembering costs the database nothing and no schema changes. Everything here is a shortcut: if it is missing, expired
 * or the read fails, the source is simply crawled in full, as before.
 */
export type CrawlState = {
  /** crawlSignature() of the monitorings and source this state was recorded under. */
  sig: string;
  /** Keys of the stories in the last feed that was ingested. */
  seen: string[];
  /** The publisher's version of that feed (ETag / Last-Modified). */
  validators?: { etag?: string; lastModified?: string };
  /** When every story was last looked at in full (a daily full pass guards against any stale shortcut). */
  fullAt: number;
  /** Failed checks in a row, and the earliest time the next fetch is allowed. */
  failures: number;
  nextAt?: number;
};

export interface CrawlStateStore {
  get(sourceId: string): Promise<CrawlState | null>;
  set(sourceId: string, state: CrawlState): Promise<void>;
}

/** A full pass at least this often: any shortcut that went stale is corrected within a day. */
export const FULL_PASS_MS = 24 * 3_600_000;
const STATE_TTL_SECONDS = 3 * 24 * 3600;
/** A feed of more than this many stories remembers only the newest ones listed. */
export const MAX_SEEN = 300;

let lastWarn = 0;
function warnOnce(what: string, error: unknown): void {
  if (Date.now() - lastWarn < 60_000) return;
  lastWarn = Date.now();
  console.warn(`[worker] crawl memory: ${what} failed, crawling without it:`, error instanceof Error ? error.message : error);
}

export function redisCrawlStateStore(redis: Redis): CrawlStateStore {
  const key = (sourceId: string) => `crawl:state:${sourceId}`;
  return {
    async get(sourceId) {
      try {
        const raw = await redis.get(key(sourceId));
        return raw ? (JSON.parse(raw) as CrawlState) : null;
      } catch (error) {
        warnOnce("read", error);
        return null;
      }
    },
    async set(sourceId, state) {
      try {
        await redis.set(key(sourceId), JSON.stringify({ ...state, seen: state.seen.slice(0, MAX_SEEN) }), "EX", STATE_TTL_SECONDS);
      } catch (error) {
        warnOnce("write", error);
      }
    },
  };
}

export function memoryCrawlStateStore(): CrawlStateStore & { states: Map<string, CrawlState> } {
  const states = new Map<string, CrawlState>();
  return {
    states,
    async get(sourceId) {
      return states.get(sourceId) ?? null;
    },
    async set(sourceId, state) {
      states.set(sourceId, state);
    },
  };
}

/** Counters for the admin page; a failure to count never fails a crawl. */
export type CrawlStatsSink = (increments: Partial<Record<CrawlStatField, number>>) => Promise<void>;

export function redisCrawlStats(redis: Redis): CrawlStatsSink {
  return async (increments) => {
    try {
      const key = crawlStatsKey(new Date());
      const pipeline = redis.pipeline();
      for (const [field, by] of Object.entries(increments)) if (by) pipeline.hincrby(key, field, by);
      pipeline.expire(key, CRAWL_STATS_TTL_SECONDS);
      await pipeline.exec();
    } catch (error) {
      warnOnce("counting", error);
    }
  };
}
