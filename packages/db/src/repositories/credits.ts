import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { countTrackedKeywords, type QueryAst } from "@cim/core";
import type { Db } from "../client";
import { creditLedger, type CreditLedgerKind } from "../schema/billing";
import { monitoringQueries } from "../schema/monitoring";
import type { OrganizationId } from "./tenant-scope";

/** Distinct tracked keywords across the org's active queries (see core/tracked-keywords.ts). */
export async function getTrackedKeywordCount(db: Db, organizationId: OrganizationId): Promise<number> {
  const rows = await db
    .select({ queryAst: monitoringQueries.queryAst })
    .from(monitoringQueries)
    .where(
      and(
        eq(monitoringQueries.organizationId, organizationId),
        eq(monitoringQueries.status, "active"),
        isNull(monitoringQueries.deletedAt),
      ),
    );
  return countTrackedKeywords(rows.map((row) => row.queryAst as QueryAst));
}

export type MeterKeywordDayResult = { keywords: number; charged: boolean };

/**
 * Debits one credit per tracked keyword for `day` ("YYYY-MM-DD", UTC).
 * Idempotent per (org, day): the ledger's unique (org, kind, ref_id) index
 * turns a second run into a no-op, so a retried or doubly-scheduled job
 * cannot double-charge. The first run of the day fixes that day's count.
 * Nothing is written when no keyword is tracked.
 */
export async function meterKeywordDay(
  db: Db,
  organizationId: OrganizationId,
  day: string,
): Promise<MeterKeywordDayResult> {
  const keywords = await getTrackedKeywordCount(db, organizationId);
  if (keywords === 0) return { keywords, charged: false };
  const inserted = await db
    .insert(creditLedger)
    .values({
      organizationId,
      kind: "keyword_day",
      amount: -keywords,
      reason: `${keywords} tracked keyword${keywords === 1 ? "" : "s"} on ${day}`,
      refId: day,
    })
    .onConflictDoNothing()
    .returning({ id: creditLedger.id });
  return { keywords, charged: inserted.length > 0 };
}

/** Append-only: a grant is a positive row; a correction is an `adjustment` row (never an update). */
export async function addLedgerEntry(
  db: Db,
  organizationId: OrganizationId,
  entry: { kind: Extract<CreditLedgerKind, "grant" | "adjustment">; amount: number; reason: string },
): Promise<void> {
  if (!Number.isInteger(entry.amount) || entry.amount === 0) {
    throw new Error("Ledger amount must be a non-zero integer");
  }
  if (entry.kind === "grant" && entry.amount < 0) throw new Error("A grant must be positive");
  await db.insert(creditLedger).values({
    organizationId,
    kind: entry.kind,
    amount: entry.amount,
    reason: entry.reason,
  });
}

export type CreditSummary = {
  /** SUM(amount) over the whole ledger — negative while there are debits and no grants. */
  balance: number;
  /** Credits consumed (debits, as a positive number) over the window. */
  usedInWindow: number;
  /** Total granted, ever. `0` means the org has no allowance — usage is measured only. */
  grantedTotal: number;
  /** Mean daily consumption over the days that were metered in the window; null with no data. */
  averageDailyUse: number | null;
  windowDays: number;
};

export async function getCreditSummary(
  db: Db,
  organizationId: OrganizationId,
  options: { windowDays?: number } = {},
): Promise<CreditSummary> {
  const windowDays = options.windowDays ?? 30;
  const since = sql`now() - (${windowDays}::text || ' days')::interval`;
  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(${creditLedger.amount}), 0)`,
      granted: sql<number>`coalesce(sum(${creditLedger.amount}) filter (where ${creditLedger.kind} = 'grant'), 0)`,
      used: sql<number>`coalesce(-sum(${creditLedger.amount}) filter (where ${creditLedger.amount} < 0 and ${creditLedger.occurredAt} >= ${since}), 0)`,
      meteredDays: sql<number>`count(*) filter (where ${creditLedger.kind} = 'keyword_day' and ${creditLedger.occurredAt} >= ${since})`,
    })
    .from(creditLedger)
    .where(eq(creditLedger.organizationId, organizationId));

  const used = Number(row?.used ?? 0);
  const meteredDays = Number(row?.meteredDays ?? 0);
  return {
    balance: Number(row?.balance ?? 0),
    usedInWindow: used,
    grantedTotal: Number(row?.granted ?? 0),
    averageDailyUse: meteredDays > 0 ? used / meteredDays : null,
    windowDays,
  };
}

/** Most recent entries first, for an auditable usage view. */
export async function listLedgerEntries(db: Db, organizationId: OrganizationId, limit = 30) {
  return db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.organizationId, organizationId), gte(creditLedger.occurredAt, sql`now() - interval '400 days'`)))
    .orderBy(sql`${creditLedger.occurredAt} desc`, sql`${creditLedger.id} desc`)
    .limit(limit);
}
