import type ExcelJS from "exceljs";
import { BRAND_COLORS, BRAND_LOGO_DATA_URI } from "./brand";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const HEADER_FILL = argb(BRAND_COLORS.blue);
const ZEBRA_FILL = argb("#F5F7FC");
const LINE = argb("#E3E6F0");

/** Mediaory header row: white bold text on the brand blue, a little taller than the data. */
export function brandHeaderRow(row: ExcelJS.Row): void {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: argb(BRAND_COLORS.deepBlue) } } };
  });
}

/**
 * The look every Mediaory spreadsheet shares: branded header, frozen so it stays in view, a filter on
 * each column, light row banding and borders, wrapped top-aligned text.
 */
export function finishSheet(sheet: ExcelJS.Worksheet, options: { filter?: boolean } = {}): void {
  if (sheet.columnCount === 0 || sheet.rowCount === 0) return;
  brandHeaderRow(sheet.getRow(1));
  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const cell = row.getCell(c);
      cell.alignment = { vertical: "top", wrapText: true, ...(cell.alignment ?? {}) };
      cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
      if (r % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA_FILL } };
    }
  }
  if (options.filter !== false && sheet.rowCount > 2) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  }
}

/** Workbook-level properties and the logo, placed to the right of the first table so no cell moves. */
export function brandWorkbook(workbook: ExcelJS.Workbook, title: string): void {
  workbook.creator = "Mediaory";
  workbook.company = "Mediaory";
  workbook.title = title;
  workbook.created = new Date();
}

export function addLogo(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, column: number): void {
  const id = workbook.addImage({ base64: BRAND_LOGO_DATA_URI, extension: "png" });
  sheet.addImage(id, { tl: { col: column, row: 0.3 }, ext: { width: 210, height: 59 } });
}
