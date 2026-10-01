import { NextResponse } from "next/server";
import { db, isTeamLead } from "@cim/db";
import { requireOrgContext, type OrgContext } from "@/lib/tenant";

type Authed = { context: OrgContext; response?: undefined } | { context?: undefined; response: NextResponse };

/** Any signed-in member of the organization. */
export async function authorizeMember(): Promise<Authed> {
  try {
    return { context: await requireOrgContext() };
  } catch {
    return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
}

/** May this person create teams? Everyone who works with mentions — i.e. not a report-only recipient. */
export function canCreateTeams(context: OrgContext): boolean {
  return context.permissions.includes("mentions:read");
}

/** May this person change a team (rename, add/remove others, delete)? Its lead, or someone who manages members. */
export async function canManageTeam(context: OrgContext, teamId: string): Promise<boolean> {
  if (context.permissions.includes("org:manage_members")) return true;
  return isTeamLead(db, teamId, context.userId);
}
