import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { hostMatchesDomain } from "@cim/core";
import { isColumnistFeed, sourceCollections } from "@cim/core/source-collections";
import type { Db } from "../client";
import { sources } from "../schema/content";
import { blockedDomains } from "../schema/compliance";

/** One atomic, reversible scope change. Source rows, articles and mentions are never deleted. */
export async function applyTurkeyStartupCrawlPolicy(db: Db, ids?: string[]) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('sources:cost-policy'))`,
    );
    const blocked = await tx
      .select({ domain: blockedDomains.domain })
      .from(blockedDomains);
    const rows = await tx
      .select({
        id: sources.id,
        name: sources.name,
        domain: sources.domain,
        url: sources.url,
        country: sources.country,
        language: sources.language,
        status: sources.status,
      })
      .from(sources)
      .where(
        and(
          notInArray(sources.connector, ["mock", "mock-social"]),
          ids ? inArray(sources.id, ids) : undefined,
        ),
      );
    const pause: string[] = [];
    const resume: string[] = [];
    const turkey: string[] = [];
    let startup = 0;
    for (const source of rows) {
      const groups = sourceCollections(source);
      if (groups.includes("turkey")) turkey.push(source.id);
      if (groups.includes("startup")) startup++;
      if (!groups.length && source.status !== "unavailable") pause.push(source.id);
      if (
        groups.includes("startup") &&
        source.status === "unavailable" &&
        !isColumnistFeed(source) &&
        !blocked.some((entry) => hostMatchesDomain(source.domain, entry.domain))
      )
        resume.push(source.id);
    }
    let paused = 0;
    let resumed = 0;
    let reclassified = 0;
    for (let i = 0; i < pause.length; i += 500)
      paused += (
        await tx
          .update(sources)
          .set({ status: "unavailable", updatedAt: new Date() })
          .where(
            and(
              inArray(sources.id, pause.slice(i, i + 500)),
              ne(sources.status, "unavailable"),
            ),
          )
          .returning({ id: sources.id })
      ).length;
    for (let i = 0; i < resume.length; i += 500)
      resumed += (
        await tx
          .update(sources)
          .set({ status: "delayed", updatedAt: new Date() })
          .where(
            and(
              inArray(sources.id, resume.slice(i, i + 500)),
              eq(sources.status, "unavailable"),
            ),
          )
          .returning({ id: sources.id })
      ).length;
    // Country here is monitoring audience scope, not the publisher's registered address.
    for (let i = 0; i < turkey.length; i += 500)
      reclassified += (
        await tx
          .update(sources)
          .set({ country: "TR", updatedAt: new Date() })
          .where(
            and(
              inArray(sources.id, turkey.slice(i, i + 500)),
              sql`${sources.country} is distinct from 'TR'`,
            ),
          )
          .returning({ id: sources.id })
      ).length;
    return {
      paused,
      resumed,
      reclassified,
      turkey: turkey.length,
      startup,
      total: rows.length,
    };
  });
}
