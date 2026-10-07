import { NextResponse } from "next/server";
import { csvForExcel, renderVisualCsv } from "@cim/core";
import { renderVisualXlsx } from "@cim/reports/xlsx";
import { renderVisualHtml, renderVisualSvg, type VisualTheme } from "@cim/reports/visual";
import { visualSpecSchema } from "@cim/validation";
import { db, getSavedVisual, runVisual } from "@cim/db";
import { svgToPng } from "../../png";
import { authorize } from "../../auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Download of a saved visual's current numbers: CSV (default), XLSX, or the picture itself — PNG, SVG, or a
 * self-contained HTML page — exactly as the dashboard draws it (`?theme=light` for a print-friendly version).
 */
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
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const theme: VisualTheme = url.searchParams.get("theme") === "light" ? "light" : "dark";
  const picture = {
    name: visual.name,
    rows: result.rows,
    measure: spec.data.measure,
    dimension: spec.data.dimension,
    periodDays: spec.data.periodDays,
    chartType: visual.kind === "table" ? ("table" as const) : spec.data.chartType,
  };
  const download = (body: BodyInit, type: string, extension: string) =>
    new NextResponse(body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${slug}.${extension}"`,
        "Cache-Control": "no-store",
      },
    });

  if (format === "svg") return download(renderVisualSvg(picture, theme), "image/svg+xml; charset=utf-8", "svg");
  if (format === "html") return download(renderVisualHtml(picture, theme), "text/html; charset=utf-8", "html");
  if (format === "png") {
    const png = await svgToPng(renderVisualSvg(picture, theme));
    if (!png) return NextResponse.json({ error: "PNG export is not available on this server — use SVG or HTML." }, { status: 501 });
    return download(new Uint8Array(png.data), "image/png", "png");
  }
  if (format === "xlsx") {
    // The sheet carries the chart as the dashboard draws it (light, so it reads on Excel's white grid).
    const chartPng = await svgToPng(renderVisualSvg(picture, "light"));
    const xlsx = await renderVisualXlsx(
      {
        id: visual.id,
        name: visual.name,
        measure: spec.data.measure,
        dimension: spec.data.dimension,
        periodDays: spec.data.periodDays,
        rows: result.rows,
      },
      { chartPng: chartPng ?? undefined },
    );
    return download(new Uint8Array(xlsx), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx");
  }

  return download(csvForExcel(renderVisualCsv(result.rows, spec.data)), "text/csv; charset=utf-8", "csv");
}
