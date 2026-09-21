import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../client";
import { projects } from "../schema/organizations";
import type { OrganizationId } from "./tenant-scope";

export async function listProjects(db: Db, organizationId: OrganizationId) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt));
}

export async function getProject(
  db: Db,
  organizationId: OrganizationId,
  projectId: string,
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return project;
}

export async function createProject(
  db: Db,
  organizationId: OrganizationId,
  input: { workspaceId: string; name: string },
) {
  const [project] = await db
    .insert(projects)
    .values({
      organizationId,
      workspaceId: input.workspaceId,
      name: input.name,
    })
    .returning();
  if (!project) throw new Error("Failed to create project");
  return project;
}
