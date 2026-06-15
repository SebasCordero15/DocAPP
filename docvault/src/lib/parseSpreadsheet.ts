import * as XLSX from "xlsx";

const SPREADSHEET_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel",                                           // .xls
  "text/csv",
  "application/csv",
]);

export function isSpreadsheet(mimeType: string): boolean {
  return SPREADSHEET_MIME_TYPES.has(mimeType);
}

/**
 * Parse the first sheet of an Excel or CSV buffer.
 * Returns up to 10 rows as string[][]; all values coerced to strings.
 * Returns [] if the sheet is empty or unreadable.
 */
export function parsePreview(buffer: Buffer, mimeType: string): string[][] {
  const type = mimeType === "text/csv" || mimeType === "application/csv" ? "string" : "buffer";
  const input = type === "string" ? buffer.toString("utf8") : buffer;

  const workbook = XLSX.read(input, { type, dense: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  return (rows as unknown[][])
    .slice(0, 10)
    .map((row) => row.map((cell) => String(cell ?? "")));
}
