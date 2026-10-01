import { afterAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "../client";
import { organizationMemberships, organizations, users } from "../schema/index";
import { asOrganizationId } from "./tenant-scope";
import { addTeamMember, createTeam, deleteTeam, getTeam, isTeamLead, listTeams, removeTeamMember } from "./teams";

const tag = `teams-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function makeOrg(label: string) {
  const [org] = await db.insert(organizations).values({ name: `${label} Co`, slug: `${tag}-${label}` }).returning();
  return asOrganizationId(org!.id);
}

async function makeUser(label: string, organizationId: ReturnType<typeof asOrganizationId>, status = "active") {
  const [user] = await db
    .insert(users)
    .values({ email: `${tag}-${label}@example.test`, passwordHash: "x", firstName: label, lastName: "Tester" })
    .returning();
  await db.insert(organizationMemberships).values({ organizationId, userId: user!.id, role: "analyst", status });
  return user!.id;
}

describe("teams (integration)", () => {
  afterAll(async () => {
    // Cascades to memberships, teams and team members.
    await db.delete(organizations).where(like(organizations.slug, `${tag}-%`));
    await db.delete(users).where(like(users.email, `${tag}-%`));
  });

  it("creates a team with its creator as lead, rejects a duplicate name, and keeps teams per organization", async () => {
    const orgA = await makeOrg("a");
    const orgB = await makeOrg("b");
    const ana = await makeUser("ana", orgA);

    const created = await createTeam(db, orgA, ana, { name: "Press Office", description: "Daily media" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await isTeamLead(db, created.team.id, ana)).toBe(true);

    // Same name (any case) in the same organization is refused; another organization may reuse it.
    expect(await createTeam(db, orgA, ana, { name: "press office" })).toEqual({ ok: false, reason: "name_taken" });
    expect((await createTeam(db, orgB, await makeUser("bo", orgB), { name: "Press Office" })).ok).toBe(true);

    const teamsA = await listTeams(db, orgA);
    expect(teamsA).toHaveLength(1);
    expect(teamsA[0]).toMatchObject({ name: "Press Office", description: "Daily media" });
    expect(teamsA[0]!.members.map((m) => [m.firstName, m.role])).toEqual([["ana", "lead"]]);

    // Another tenant can neither see nor touch it.
    expect(await getTeam(db, orgB, created.team.id)).toBeUndefined();
    expect(await deleteTeam(db, orgB, created.team.id)).toBe(false);
    expect((await addTeamMember(db, orgB, created.team.id, ana)).ok).toBe(false);
  });

  it("only adds active members of the organization, and hides revoked ones", async () => {
    const org = await makeOrg("c");
    const lead = await makeUser("lee", org);
    const member = await makeUser("max", org);
    const revoked = await makeUser("rex", org, "revoked");
    const outsider = await makeUser("out", await makeOrg("d"));

    const created = await createTeam(db, org, lead, { name: "Regional desk" });
    if (!created.ok) throw new Error("setup");
    const teamId = created.team.id;

    expect(await addTeamMember(db, org, teamId, member)).toEqual({ ok: true });
    expect(await addTeamMember(db, org, teamId, revoked)).toEqual({ ok: false, reason: "not_a_member" });
    expect(await addTeamMember(db, org, teamId, outsider)).toEqual({ ok: false, reason: "not_a_member" });
    expect(await addTeamMember(db, org, "00000000-0000-4000-8000-000000000000", member)).toEqual({ ok: false, reason: "not_found" });

    // A member who is later revoked disappears from the team listing.
    await db
      .update(organizationMemberships)
      .set({ status: "revoked" })
      .where(and(eq(organizationMemberships.organizationId, org), eq(organizationMemberships.userId, member)));
    const [team] = await listTeams(db, org);
    expect(team!.members.map((m) => m.firstName)).toEqual(["lee"]);
  });

  it("promotes the longest-standing member when the only lead leaves, and deletes softly", async () => {
    const org = await makeOrg("e");
    const lead = await makeUser("lia", org);
    const second = await makeUser("sam", org);
    const third = await makeUser("tom", org);
    const created = await createTeam(db, org, lead, { name: "Agency team" });
    if (!created.ok) throw new Error("setup");
    const teamId = created.team.id;
    await addTeamMember(db, org, teamId, second);
    await addTeamMember(db, org, teamId, third);

    expect(await removeTeamMember(db, org, teamId, lead)).toBe(true);
    expect(await isTeamLead(db, teamId, second)).toBe(true);
    expect(await isTeamLead(db, teamId, third)).toBe(false);
    expect(await removeTeamMember(db, org, teamId, lead)).toBe(false); // already gone

    expect(await deleteTeam(db, org, teamId)).toBe(true);
    expect(await listTeams(db, org)).toEqual([]);
    // The name is free again once deleted.
    expect((await createTeam(db, org, second, { name: "Agency team" })).ok).toBe(true);
  });
});
