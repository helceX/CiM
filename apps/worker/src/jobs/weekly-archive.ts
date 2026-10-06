import type { Queue } from "bullmq";
import { getEnv } from "@cim/config";
import { lastCompletedWeek, type SendEmailJobData } from "@cim/core";
import {
  claimArchiveRun,
  db,
  deleteArchivedMentions,
  failStaleArchiveRuns,
  getOrganizationName,
  listArchiveRecipientEmails,
  listArchiveRunsDueForDeletion,
  listMentionsForArchive,
  listOrganizationsNeedingArchive,
  markArchiveEmailed,
  markArchiveFailed,
  markArchiveReady,
  asOrganizationId,
  type Db,
} from "@cim/db";
import type { ArchiveFile } from "@cim/db/schema";
import { ObjectStore, r2ConfigFromEnv, renderArchiveHtml, renderArchiveXlsx } from "@cim/reports/archive";
import { queueOutboxEmail } from "../email";

export type ArchiveDeps = {
  env?: Record<string, string | undefined>;
  database?: Db;
  now?: () => Date;
  store?: Pick<ObjectStore, "put" | "head" | "delete">;
  emailQueue?: Queue<SendEmailJobData>;
  appUrl?: string;
};

export type ArchiveResult = { built: number; failed: number; emailed: number; deleted: number; note: string | null };

/** `ARCHIVE_DELETE_AFTER_DAYS` (worker env): once an archived week ended this many days ago, its mentions leave the database. Unset = never. Minimum 28. */
export function archiveDeleteAfterDays(env: Record<string, string | undefined>): number | null {
  const days = Number(env.ARCHIVE_DELETE_AFTER_DAYS);
  return Number.isInteger(days) && days >= 28 && days <= 3650 ? days : null;
}

/**
 * Every Monday: for each organization with mentions in the week that just ended, build the
 * archive (one self-contained HTML page + a spreadsheet), store both in object storage,
 * check they are really there, record it, and email the owners and admins a link to the
 * Archive page. Without R2 configured it does nothing and says why.
 *
 * Deleting archived weeks from the database is a separate, opt-in step
 * (ARCHIVE_DELETE_AFTER_DAYS) and only ever touches weeks whose files were verified in storage
 * moments before — never a failed, missing or half-built archive.
 */
export async function processWeeklyArchiveJob(deps: ArchiveDeps = {}): Promise<ArchiveResult> {
  const env = deps.env ?? process.env;
  const database = deps.database ?? db;
  const now = (deps.now ?? (() => new Date()))();
  const result: ArchiveResult = { built: 0, failed: 0, emailed: 0, deleted: 0, note: null };

  const config = r2ConfigFromEnv(env);
  const store = deps.store ?? (config ? new ObjectStore(config) : null);
  if (!store) {
    result.note = "Object storage is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET) — nothing archived.";
    console.log(`[weekly-archive] ${result.note}`);
    return result;
  }

  await failStaleArchiveRuns(database);
  const period = lastCompletedWeek(now);
  const appUrl = deps.appUrl ?? getEnv().APP_URL;

  for (const orgId of await listOrganizationsNeedingArchive(database, period.start, period.end)) {
    const organizationId = asOrganizationId(orgId);
    const run = await claimArchiveRun(database, organizationId, period.start, period.end);
    if (!run) continue;
    try {
      const organizationName = (await getOrganizationName(database, orgId)) ?? "Organization";
      const { items, truncated } = await listMentionsForArchive(database, organizationId, period.start, period.end);
      const html = renderArchiveHtml({
        organizationName,
        periodLabel: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        generatedAt: now,
        truncated,
        mentions: items,
      });
      const xlsx = await renderArchiveXlsx({ organizationName, periodLabel: period.label, mentions: items });

      const prefix = `orgs/${orgId}/weekly/${period.label}`;
      const files: ArchiveFile[] = [];
      const upload = async (name: string, body: string | Uint8Array, contentType: string) => {
        const key = `${prefix}/${name}`;
        await store.put(key, body, contentType, `mediaory-${period.label}-${name}`);
        const stored = await store.head(key);
        const bytes = typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.byteLength;
        if (!stored || stored.bytes !== bytes) throw new Error(`Stored copy of ${name} does not match what was uploaded.`);
        files.push({ name, key, bytes, contentType });
      };
      await upload("archive.html", html, "text/html; charset=utf-8");
      await upload("mentions.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      await markArchiveReady(database, run.id, { files, mentionCount: items.length, truncated });
      result.built += 1;

      if (deps.emailQueue) {
        const recipients = await listArchiveRecipientEmails(database, organizationId);
        const subject = `Your Mediaory weekly archive ${period.label}: ${items.length.toLocaleString("en-GB")} mentions`;
        const bodyText = [
          `Your ${period.label} archive (${period.start} to ${period.end}) is ready: ${items.length.toLocaleString("en-GB")} mentions.`,
          "",
          `Open it, with a link to every original story: ${appUrl}/archive`,
          "It is a single page you can read, search and print, plus a spreadsheet of the same mentions.",
          "",
          "You keep these archives after the week's stories leave the live view.",
        ].join("\n");
        for (const toEmail of recipients) await queueOutboxEmail(deps.emailQueue, { toEmail, subject, bodyText, kind: "archive" }, `archive for org ${orgId}`);
        if (recipients.length > 0) {
          await markArchiveEmailed(database, run.id);
          result.emailed += recipients.length;
        }
      }
    } catch (error) {
      result.failed += 1;
      console.error(`[weekly-archive] org ${orgId} ${period.label} failed:`, error);
      await markArchiveFailed(database, run.id, error instanceof Error ? error.message : "Archive failed.").catch(() => undefined);
    }
  }

  const deleteAfter = archiveDeleteAfterDays(env);
  if (deleteAfter !== null) {
    const cutoff = new Date(now.getTime() - deleteAfter * 86_400_000).toISOString().slice(0, 10);
    for (const run of await listArchiveRunsDueForDeletion(database, cutoff)) {
      try {
        // Re-check the stored files right now; if any is missing or a different size, keep the data.
        const verified = run.files.length > 0 && (await Promise.all(run.files.map(async (f) => (await store.head(f.key))?.bytes === f.bytes))).every(Boolean);
        if (!verified) {
          console.error(`[weekly-archive] not deleting ${run.periodStart} for org ${run.organizationId}: stored files could not be verified`);
          continue;
        }
        result.deleted += await deleteArchivedMentions(database, run);
      } catch (error) {
        console.error(`[weekly-archive] deleting ${run.periodStart} for org ${run.organizationId} failed:`, error);
      }
    }
  }
  console.log(`[weekly-archive] ${period.label}: built ${result.built}, failed ${result.failed}, emails ${result.emailed}, mentions deleted ${result.deleted}`);
  return result;
}

