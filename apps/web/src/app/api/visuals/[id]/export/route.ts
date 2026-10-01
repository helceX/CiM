import { NextResponse } from "next/server";
import { renderVisualCsv } from "@cim/core";
import { renderVisualXlsx } from "@cim/reports/xlsx";
import { visualSpecSchema } from "@cim/validation";
import { db, getSavedVisual, runVisual } from "@cim/db";
import { authorize } from "../../auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** CSV (default) or XLSX (`?format=xlsx`) download of a saved visual's current numbers. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize("monitoring:read");
  if (auth.response) return auth.response;
  const { context } = auth;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Visual not found" }, { status: 404 });
  const visual = await getSavedVisual(db, context.organizationId, id);
  if (!visual) return NextResponse.json({ error: "Visual not found" }, { status: 404 });

  const spec = visualSpecSchema.safeParse(visual.spec);
  if (!spec.success) return NextResponse.json({ error: "This visual can't be exported" }, { status: 422 });

  let result;
  try {
    result = await runVisual(db, context.organizationId, spec.data);
  } catch (error) {
    console.error("[visuals] export failed:", error);
    return NextResponse.json({ error: "This visual could not be computed." }, { status: 500 });
  }

  // The name is user text: keep the download filename to a safe ASCII slug.
  const slug = visual.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "visual";
  if (new URL(request.url).searchParams.get("format") === "xlsx") {
    const xlsx = await renderVisualXlsx({
      id: visual.id,
      name: visual.name,
      measure: spec.data.measure,
      dimension: spec.data.dimension,
      periodDays: spec.data.periodDays,
      rows: result.rows,
    });
    return new NextResponse(new Uint8Array(xlsx), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${slug}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(renderVisualCsv(result.rows, spec.data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
