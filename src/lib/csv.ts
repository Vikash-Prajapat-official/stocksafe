// CSV writer for exports. Excel-friendly (UTF-8 BOM, CRLF) and safe against spreadsheet formula injection.

type Cell = string | number | null | undefined;

function cell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v); // real numbers (including negative ones) are never text
  // A text cell starting with = + - @ tab or CR would be run as a formula by Excel/Sheets: prefix a quote.
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [headers, ...rows].map((r) => r.map(cell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
