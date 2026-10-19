import { sql } from "drizzle-orm";
import type { Db } from "../client";
import type { OrganizationId } from "./tenant-scope";

/** Called only after a session-authenticated viewer has opened a real, tenant-scoped mention. */
export async function recordFirstResultView(
  db: Db,
  organizationId: OrganizationId,
  userId: string,
  mentionId: string,
) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`activation:${organizationId}:${userId}`}))`,
    );
    await tx.execute(sql`
      insert into audit_logs (organization_id, actor_user_id, action, target_type)
      select ${organizationId}::uuid, ${userId}::uuid, 'activation.first_result_viewed', 'activation'
      where exists (select 1 from mentions where id = ${mentionId}::uuid and organization_id = ${organizationId}::uuid)
        and not exists (select 1 from audit_logs where organization_id = ${organizationId}::uuid
          and actor_user_id = ${userId}::uuid and action = 'activation.first_result_viewed')
    `);
  });
}

export type ActivationFunnel = {
  registered: number;
  verified: number;
  monitoring: number;
  resultsAvailable: number;
  resultViewed: number;
  returned: number;
};

/** Admin aggregates only. Distinct registration cohort, excluding deleted identities and platform operators. */
export async function getActivationFunnel(db: Db): Promise<ActivationFunnel> {
  const result = await db.execute<ActivationFunnel>(sql`
    with cohort as (
      select a.actor_user_id as user_id, a.organization_id, min(a.created_at) as registered_at
      from audit_logs a join users u on u.id = a.actor_user_id
      join organizations o on o.id = a.organization_id
      where a.action = 'user.registered' and a.created_at >= now() - interval '30 days'
        and u.deleted_at is null and o.deleted_at is null and not u.is_platform_super_admin
      group by a.actor_user_id, a.organization_id
    ), stages as (
      select c.*, u.email_verified_at,
        exists (select 1 from monitoring_queries q where q.organization_id = c.organization_id and q.deleted_at is null) as has_monitoring,
        exists (select 1 from mentions m where m.organization_id = c.organization_id and m.created_at >= c.registered_at) as has_results,
        (select min(a.created_at) from audit_logs a where a.organization_id = c.organization_id
          and a.actor_user_id = c.user_id and a.action = 'activation.first_result_viewed') as viewed_at
      from cohort c join users u on u.id = c.user_id
    )
    select count(distinct user_id)::int as registered,
      count(distinct user_id) filter (where email_verified_at is not null)::int as verified,
      count(distinct user_id) filter (where email_verified_at is not null and has_monitoring)::int as monitoring,
      count(distinct user_id) filter (where email_verified_at is not null and has_monitoring and has_results)::int as "resultsAvailable",
      count(distinct user_id) filter (where email_verified_at is not null and has_monitoring and has_results and viewed_at is not null)::int as "resultViewed",
      count(distinct user_id) filter (where email_verified_at is not null and has_monitoring and has_results and viewed_at is not null and exists (
        select 1 from sessions s where s.user_id = stages.user_id and s.created_at >= stages.viewed_at + interval '24 hours'
      ))::int as returned
    from stages
  `);
  if (!result.rows[0]) throw new Error("Activation funnel unavailable");
  return result.rows[0];
}
