import "server-only";
import { Queue } from "bullmq";
import { QUEUE_NAMES, type WeeklyArchiveJobData } from "@cim/core";
import { ObjectStore, r2ConfigFromEnv } from "@cim/reports/archive";
import { getRedis } from "./redis";

/** The archive's object store, or null when the R2_* variables are not set on the web service. */
export function getArchiveStore(): ObjectStore | null {
  const config = r2ConfigFromEnv(process.env);
  return config ? new ObjectStore(config) : null;
}

let weeklyArchiveQueue: Queue<WeeklyArchiveJobData> | undefined;

/** Ask the worker to build (and, if configured, email) the last completed week now. */
export async function enqueueWeeklyArchive(): Promise<void> {
  weeklyArchiveQueue ??= new Queue<WeeklyArchiveJobData>(QUEUE_NAMES.weeklyArchive, { connection: getRedis() });
  await weeklyArchiveQueue.add(QUEUE_NAMES.weeklyArchive, {}, { attempts: 1, removeOnComplete: 20, removeOnFail: 20 });
}
