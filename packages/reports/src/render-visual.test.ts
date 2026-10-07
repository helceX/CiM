import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { renderVisualHtml, renderVisualSvg, type VisualExportInput } from "./render-visual";
import { renderVisualXlsx } from "./render-xlsx";

const days = Array.from({ length: 10 }, (_, i) => ({ label: `2026-10-${String(i + 1).padStart(2, "0")}`, value: i * 2 }));
const sources = [
  { label: "Webrazzi", value: 12 },
  { label: "Hürriyet <b>x</b>", value: 7 },
  { label: "Sözcü", value: null },
];
const base: Omit<VisualExportInput, "rows" | "dimension" | "chartType"> = { name: "Board & volume", measure: "mentions", periodDays: 30 };

describe("renderVisualSvg", () => {
  it("draws every chart form as a branded, standalone SVG", () => {
    const forms: [VisualExportInput["chartType"], VisualExportInput["dimension"], VisualExportInput["rows"]][] = [
      ["bar", "source", sources],
      ["bar", "day", days],
      ["line", "day", days],
      ["area", "day", days],
      ["pie", "source_type", sources.slice(0, 2)],
      ["table", "source", sources],
    ];
    for (const [chartType, dimension, rows] of forms) {
      const svg = renderVisualSvg({ ...base, chartType, dimension, rows });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("data:image/png;base64,"); // the logo is inside the file
      expect(svg).toContain("Board &amp; volume"); // the title, escaped
      expect(svg).not.toContain("<b>x</b>"); // labels are text, never markup
      expect(svg.endsWith("</svg>")).toBe(true);
    }
  });

  it("uses ranked horizontal bars for categories and columns for time", () => {
    expect(renderVisualSvg({ ...base, chartType: "bar", dimension: "source", rows: sources })).toContain("-hbar)");
    expect(renderVisualSvg({ ...base, chartType: "bar", dimension: "day", rows: days })).toContain("-bar)");
  });

  it("falls back to the table when a pie would have too many slices, and says so", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ label: `S${i}`, value: i + 1 }));
    const svg = renderVisualSvg({ ...base, chartType: "pie", dimension: "source", rows: many });
    expect(svg).toContain("shows at most 6 slices");
  });

  it("says so when there is no data, and shows an undefined share as a dash, not 0", () => {
    expect(renderVisualSvg({ ...base, chartType: "bar", dimension: "day", rows: [] })).toContain("No data for this period.");
    const svg = renderVisualSvg({ ...base, measure: "negative_share", chartType: "table", dimension: "day", rows: [{ label: "2026-10-01", value: null }] });
    expect(svg).toContain("—");
  });

  it("has a light version for print", () => {
    const light = renderVisualSvg({ ...base, chartType: "bar", dimension: "source", rows: sources }, "light");
    expect(light).toContain("#ffffff");
    expect(light).not.toBe(renderVisualSvg({ ...base, chartType: "bar", dimension: "source", rows: sources }));
  });
});

describe("renderVisualHtml", () => {
  it("is a self-contained page with the picture and the same numbers as a table", () => {
    const html = renderVisualHtml({ ...base, chartType: "bar", dimension: "source", rows: sources });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<svg");
    expect(html).toContain("<table>");
    expect(html).toContain("Hürriyet &lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toMatch(/<script/i);
  });
});

describe("renderVisualXlsx with a picture", () => {
  const png = { data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"), width: 1, height: 1 };
  const visual = { id: "v1", name: "Volume", measure: "mentions" as const, dimension: "source" as const, periodDays: 30, rows: [{ label: "Webrazzi", value: 1234 }] };

  it("puts the chart picture beside a formatted table", async () => {
    const buffer = await renderVisualXlsx(visual, { chartPng: png });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.getImages()).toHaveLength(1);
    expect(sheet.getCell("B2").value).toBe(1234);
    expect(sheet.getCell("B2").numFmt).toBe("#,##0");
    expect(sheet.getCell("A1").fill).toMatchObject({ fgColor: { argb: "FF0026EA" } });
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });

  it("still works without a picture", async () => {
    const buffer = await renderVisualXlsx(visual);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets[0]!.getImages()).toHaveLength(0);
  });
});
