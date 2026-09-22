import { and, desc, eq, isNull } from "drizzle-orm";
import { generateRawToken, hashToken } from "@cim/core";
import type { Db } from "../client";
import { apiKeys } from "../schema/organizations";
import type { OrganizationId } from "./tenant-scope";

/** A short, greppable prefix on the raw secret — same idea as Stripe's `sk_live_...`. */
const KEY_PREFIX = "cim_";

export type ApiKeySummary = {
  id: string;
  name: string;
  scopes: string[];
  createdByUserId: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

const summaryColumns = {
  id: apiKeys.id,
  name: apiKeys.name,
  scopes: apiKeys.scopes,
  createdByUserId: apiKeys.createdByUserId,
  lastUsedAt: apiKeys.lastUsedAt,
  revokedAt: apiKeys.revokedAt,
  createdAt: apiKeys.createdAt,
};

/**
 * docs/architecture/SECURITY.md §83 — "Created secret is shown exactly
 * once; only its hash is stored." The caller gets `rawKey` back from this
 * one call and never again; every later read (`listApiKeys`) selects only
 * `summaryColumns`, which excludes `hashedSecret` at the query level, not
 * just by convention in a mapper.
 */
export async function createApiKey(
  db: Db,
  organizationId: OrganizationId,
  input: { name: string; scopes: string[]; createdByUserId: string },
): Promise<{ rawKey: string; summary: ApiKeySummary }> {
  const rawKey = `${KEY_PREFIX}${generateRawToken()}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      organizationId,
      name: input.name,
      hashedSecret: hashToken(rawKey),
      scopes: input.scopes,
      createdByUserId: input.createdByUserId,
    })
    .returning(summaryColumns);
  if (!row) throw new Error("failed to create API key");
  return { rawKey, summary: row };
}

export async function listApiKeys(
  db: Db,
  organizationId: OrganizationId,
): Promise<ApiKeySummary[]> {
  return db
    .select(summaryColumns)
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(
  db: Db,
  organizationId: OrganizationId,
  apiKeyId: string,
): Promise<boolean> {
  const result = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.organizationId, organizationId),
        eq(apiKeys.id, apiKeyId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });
  return result.length > 0;
}

export type ResolvedApiKey = {
  id: string;
  organizationId: OrganizationId;
  scopes: string[];
};

/**
 * The auth path (apps/web/src/lib/tenant.ts) calls this on every
 * API-key-authenticated request — a revoked key must stop working
 * immediately, not just disappear from the management list, so revocation
 * is checked here rather than left to callers to remember.
 */
export async function resolveApiKeyByRawKey(
  db: Db,
  rawKey: string,
): Promise<ResolvedApiKey | null> {
  const [row] = await db
    .select({ id: apiKeys.id, organizationId: apiKeys.organizationId, scopes: apiKeys.scopes })
    .from(apiKeys)
    .where(and(eq(apiKeys.hashedSecret, hashToken(rawKey)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  return { ...row, organizationId: row.organizationId as OrganizationId };
}

export async function touchApiKeyLastUsed(db: Db, apiKeyId: string): Promise<void> {
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKeyId));
}
