import Redis from "ioredis";
import { getEnv } from "@cim/config";

let client: Redis | undefined;

export function getRedisConnection(): Redis {
  if (!client) {
    // BullMQ requires this for blocking commands used by its workers.
    client = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
  }
  return client;
}
