import { NextResponse } from "next/server";
import { db, getArchiveRun } from "@cim/db";
import { getArchiveStore } from "@/lib/archive";
import { requirePermission } from "@/lib/tenant";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens one stored archive file. The bucket is private: after checking the caller's
 * organization owns the run, we redirect to a 5-minute signed address.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  let context;
  try {
    context = await requirePermission("reports:read");
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "FORBIDDEN";
    return NextResponse.json({ error: forbidden ? "Not allowed" : "Not authenticated" }, { status: forbidden ? 403 : 401 });
  }

  const { id, file } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Archive not found" }, { status: 404 });

  const run = await getArchiveRun(db, context.organizationId, id);
  const entry = run?.status === "ready" ? run.files.find((candidate) => candidate.name === file) : undefined;
  if (!run || !entry) return NextResponse.json({ error: "Archive not found" }, { status: 404 });

  const store = getArchiveStore();
  if (!store) return NextResponse.json({ error: "Archive storage is not configured." }, { status: 503 });

  const url = await store.presignGet(entry.key, 300);
  return NextResponse.redirect(url, 302);
}
