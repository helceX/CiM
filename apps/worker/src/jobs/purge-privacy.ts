import {
  db,
  deleteExpiredAuthRecords,
  eraseOrganization,
  listArchiveObjectKeys,
  listOrganizationsDueForErasure,
  type Db,
} from "@cim/db";
import { ObjectStore, r2ConfigFromEnv } from "@cim/reports/archive";

/** How long a deleted organization waits before it is erased for good (the privacy notice says 30 days). */
export const ORG_ERASE_DEFAULT_DAYS = 30;
/** Sessions and one-time tokens are removed this long after they expire, are revoked or are used. */
export const AUTH_RECORD_DAYS = 30;
/** A run erases a few organizations at most; the rest wait for tomorrow. */
const MAX_ORGANIZATIONS_PER_RUN = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `ORG_ERASE_DAYS` (worker env), 7–365; anything else means the default. A grace period under a week would leave no time to undo a mistake. */
export function orgEraseDays(env: Record<string, string | undefined> = process.env): number {
  const days = Number(env.ORG_ERASE_DAYS);
  return Number.isInteger(days) && days >= 7 && days <= 365 ? days : ORG_ERASE_DEFAULT_DAYS;
}

export type PurgePrivacyDeps = {
  env?: Record<string, string | undefined>;
  database?: Db;
  store?: Pick<ObjectStore, "delete"> | null;
  now?: () => Date;
};

export type PurgePrivacyResult = { organizations: number; skipped: number; sessions: number; tokens: number };

/**
 * KVKK housekeeping, once a day (docs/product/KVKK.md):
 *  - sign-in sessions and one-time tokens that ended 30+ days ago are removed;
 *  - organizations deleted 30+ days ago are erased for good — their archive files in object storage
 *    first, then the database rows — and the erasure is logged.
 * An organization whose archive files cannot be removed (storage not configured, or it refused) is
 * left for the next run rather than erased half-way.
 */
export async function processPurgePrivacyJob(deps: PurgePrivacyDeps = {}): Promise<PurgePrivacyResult> {
  const database = deps.database ?? db;
  const env = deps.env ?? process.env;
  const now = (deps.now ?? (() => new Date()))();

  const authRecords = await deleteExpiredAuthRecords(database, new Date(now.getTime() - AUTH_RECORD_DAYS * DAY_MS));

  let store = deps.store;
  if (store === undefined) {
    const config = r2ConfigFromEnv(env);
    store = config ? new ObjectStore(config) : null;
  }

  const cutoff = new Date(now.getTime() - orgEraseDays(env) * DAY_MS);
  const due = await listOrganizationsDueForErasure(database, cutoff, MAX_ORGANIZATIONS_PER_RUN);
  let organizations = 0;
  let skipped = 0;
  for (const organizationId of due) {
    try {
      const keys = await listArchiveObjectKeys(database, organizationId);
      if (keys.length > 0 && !store) {
        skipped += 1;
        console.warn(`[purge-privacy] organization ${organizationId} has ${keys.length} archive file(s) but object storage is not configured — left for later.`);
        continue;
      }
      for (const key of keys) await store!.delete(key);
      const result = await eraseOrganization(database, organizationId, { archiveFiles: keys.length });
      if (result) {
        organizations += 1;
        console.log(`[purge-privacy] erased organization ${organizationId}: ${result.mentions} mention(s), ${keys.length} archive file(s)`);
      }
    } catch (error) {
      skipped += 1;
      console.error(`[purge-privacy] could not erase organization ${organizationId}:`, error);
    }
  }

  if (authRecords.sessions > 0 || authRecords.tokens > 0) {
    console.log(`[purge-privacy] removed ${authRecords.sessions} old session(s) and ${authRecords.tokens} old token(s)`);
  }
  return { organizations, skipped, sessions: authRecords.sessions, tokens: authRecords.tokens };
}
