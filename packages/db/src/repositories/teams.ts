import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { organizationMemberships } from "../schema/organizations";
import { teamMembers, teams } from "../schema/teams";
import { users } from "../schema/users";
import type { OrganizationId } from "./tenant-scope";

export type TeamMemberRow = { userId: string; firstName: string; lastName: string; email: string; role: "lead" | "member" };
export type TeamWithMembers = {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  members: TeamMemberRow[];
};

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Is this user an active member of the organization? Teams only ever hold such users. */
async function isActiveMember(db: Db, organizationId: OrganizationId, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listTeams(db: Db, organizationId: OrganizationId): Promise<TeamWithMembers[]> {
  const teamRows = await db
    .select()
    .from(teams)
    .where(and(eq(teams.organizationId, organizationId), isNull(teams.deletedAt)))
    .orderBy(asc(teams.createdAt), asc(teams.id));
  if (teamRows.length === 0) return [];

  const memberRows = await db
    .select({
      teamId: teamMembers.teamId,
      userId: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    // Only people who are still active in this organization (a revoked member vanishes from teams).
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, teamMembers.userId),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, "active"),
      ),
    )
    .where(inArray(teamMembers.teamId, teamRows.map((team) => team.id)))
    .orderBy(asc(teamMembers.createdAt));

  return teamRows.map((team) => ({
    id: team.id,
    name: team.name,
    description: team.description,
    createdAt: team.createdAt,
    members: memberRows
      .filter((member) => member.teamId === team.id)
      .map(({ teamId: _teamId, ...member }) => member),
  }));
}

export async function getTeam(db: Db, organizationId: OrganizationId, teamId: string) {
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.organizationId, organizationId), eq(teams.id, teamId), isNull(teams.deletedAt)))
    .limit(1);
  return team;
}

/** Is `userId` a lead of this team? */
export async function isTeamLead(db: Db, teamId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  return row?.role === "lead";
}

export type CreateTeamResult =
  | { ok: true; team: typeof teams.$inferSelect }
  | { ok: false; reason: "name_taken" };

/** Creates the team and makes the creator its lead, atomically. */
export async function createTeam(
  db: Db,
  organizationId: OrganizationId,
  creatorUserId: string,
  input: { name: string; description?: string },
): Promise<CreateTeamResult> {
  try {
    return await db.transaction(async (tx) => {
      const [team] = await tx
        .insert(teams)
        .values({
          organizationId,
          name: input.name.trim(),
          description: (input.description ?? "").trim(),
          createdByUserId: creatorUserId,
        })
        .returning();
      if (!team) throw new Error("failed to create team");
      await tx.insert(teamMembers).values({ teamId: team.id, userId: creatorUserId, role: "lead" });
      return { ok: true as const, team };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "name_taken" };
    throw error;
  }
}

export type AddTeamMemberResult = { ok: true } | { ok: false; reason: "not_found" | "not_a_member" };

export async function addTeamMember(
  db: Db,
  organizationId: OrganizationId,
  teamId: string,
  userId: string,
  role: "lead" | "member" = "member",
): Promise<AddTeamMemberResult> {
  if (!(await getTeam(db, organizationId, teamId))) return { ok: false, reason: "not_found" };
  if (!(await isActiveMember(db, organizationId, userId))) return { ok: false, reason: "not_a_member" };
  await db
    .insert(teamMembers)
    .values({ teamId, userId, role })
    .onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.userId], set: { role } });
  return { ok: true };
}

/**
 * Removes a member. A team never loses its last lead this way: if the person
 * leaving is the only lead and others remain, the longest-standing member is
 * promoted; an emptied team stays (it can be deleted explicitly).
 */
export async function removeTeamMember(
  db: Db,
  organizationId: OrganizationId,
  teamId: string,
  userId: string,
): Promise<boolean> {
  if (!(await getTeam(db, organizationId, teamId))) return false;
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .returning({ role: teamMembers.role });
    if (removed.length === 0) return false;
    if (removed[0]!.role === "lead") {
      const [stillLead] = await tx
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "lead")))
        .limit(1);
      if (!stillLead) {
        const [next] = await tx
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, teamId))
          .orderBy(asc(teamMembers.createdAt))
          .limit(1);
        if (next) {
          await tx
            .update(teamMembers)
            .set({ role: "lead" })
            .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, next.userId)));
        }
      }
    }
    return true;
  });
}

export async function deleteTeam(db: Db, organizationId: OrganizationId, teamId: string): Promise<boolean> {
  const rows = await db
    .update(teams)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(teams.organizationId, organizationId), eq(teams.id, teamId), isNull(teams.deletedAt)))
    .returning({ id: teams.id });
  return rows.length > 0;
}
