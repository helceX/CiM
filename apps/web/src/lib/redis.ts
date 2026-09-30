import "server-only";
import Redis from "ioredis";
import { getEnv } from "@cim/config";

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: 2 });
  }
  return client;
}
