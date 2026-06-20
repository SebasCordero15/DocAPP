/**
 * Part 4 — spreadsheet support tests.
 *
 * Pure-function tests: no database, no HTTP.
 *
 * What is proved:
 *   1. isSpreadsheet() returns true for xlsx, xls, csv mime types.
 *   2. isSpreadsheet() returns false for pdf, image, plain-text.
 *   3. parsePreview() parses an XLSX buffer into string[][] rows.
 *   4. parsePreview() parses a CSV buffer correctly.
 *   5. parsePreview() truncates sheets with > 10 rows to exactly 10.
 *   6. parsePreview() returns [] for an empty sheet.
 *   7. Numeric cell values are coerced to strings.
 */

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { isSpreadsheet, parsePreview } from "@/lib/parseSpreadsheet";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeXlsxBuffer(rows: (string | number)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function makeCsvBuffer(content: string): Buffer {
  return Buffer.from(content, "utf8");
}

// ─── 1 & 2. isSpreadsheet ─────────────────────────────────────────────────────

describe("isSpreadsheet", () => {
  it("returns true for .xlsx mime type", () => {
    expect(isSpreadsheet("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true);
  });

  it("returns true for .xls mime type", () => {
    expect(isSpreadsheet("application/vnd.ms-excel")).toBe(true);
  });

  it("returns true for text/csv", () => {
    expect(isSpreadsheet("text/csv")).toBe(true);
  });

  it("returns true for application/csv", () => {
    expect(isSpreadsheet("application/csv")).toBe(true);
  });

  it("returns false for PDF", () => {
    expect(isSpreadsheet("application/pdf")).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(isSpreadsheet("text/plain")).toBe(false);
  });

  it("returns false for image types", () => {
    expect(isSpreadsheet("image/png")).toBe(false);
    expect(isSpreadsheet("image/jpeg")).toBe(false);
  });
});

// ─── 3. parsePreview — XLSX ───────────────────────────────────────────────────

describe("parsePreview — XLSX", () => {
  it("returns all rows from a small XLSX file", () => {
    const rows = [
      ["Name", "Age", "City"],
      ["Alice", 30, "New York"],
      ["Bob", 25, "London"],
    ];
    const buf = makeXlsxBuffer(rows);
    const result = parsePreview(buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    expect(result.length).toBe(3);
    expect(result[0]).toEqual(["Name", "Age", "City"]);
    expect(result[1]).toEqual(["Alice", "30", "New York"]);
    expect(result[2]).toEqual(["Bob", "25", "London"]);
  });

  it("truncates a sheet with more than 10 rows to exactly 10 rows", () => {
    const rows = Array.from({ length: 15 }, (_, i) => [`Row ${i + 1}`, i + 1]);
    const buf = makeXlsxBuffer(rows);
    const result = parsePreview(buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    expect(result.length).toBe(10);
    expect(result[0]).toEqual(["Row 1", "1"]);
    expect(result[9]).toEqual(["Row 10", "10"]);
  });

  it("returns [] for a completely empty sheet", () => {
    const buf = makeXlsxBuffer([]);
    const result = parsePreview(buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result).toEqual([]);
  });

  it("coerces numeric values to strings", () => {
    const buf = makeXlsxBuffer([["Price", "Qty"], [9.99, 100]]);
    const result = parsePreview(buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(typeof result[1][0]).toBe("string");
    expect(result[1][0]).toBe("9.99");
    expect(result[1][1]).toBe("100");
  });
});

// ─── 4. parsePreview — CSV ────────────────────────────────────────────────────

describe("parsePreview — CSV", () => {
  it("parses a basic CSV correctly", () => {
    const buf = makeCsvBuffer("Name,Score\nAlice,95\nBob,80");
    const result = parsePreview(buf, "text/csv");

    expect(result.length).toBe(3);
    expect(result[0]).toEqual(["Name", "Score"]);
    expect(result[1]).toEqual(["Alice", "95"]);
    expect(result[2]).toEqual(["Bob", "80"]);
  });

  it("truncates a CSV with more than 10 rows to exactly 10", () => {
    const lines = ["col1,col2", ...Array.from({ length: 14 }, (_, i) => `val${i},${i}`)];
    const buf = makeCsvBuffer(lines.join("\n"));
    const result = parsePreview(buf, "text/csv");
    expect(result.length).toBe(10);
  });

  it("handles quoted CSV fields with commas inside", () => {
    const buf = makeCsvBuffer(`Name,Address\nAlice,"123 Main St, Apt 4"\nBob,456 Oak Ave`);
    const result = parsePreview(buf, "text/csv");
    expect(result[1][1]).toBe("123 Main St, Apt 4");
  });

  it("also parses application/csv mime type", () => {
    const buf = makeCsvBuffer("A,B\n1,2");
    const result = parsePreview(buf, "application/csv");
    expect(result[0]).toEqual(["A", "B"]);
  });
});
