// What a report is, and how it is written out as CSV or shown as text. Pure: no database.

import { toCsv } from "@/lib/csv";
import { formatPaise } from "@/lib/money";

export type ColumnKind = "text" | "int" | "paise" | "date" | "percent_bp";
export type ReportColumn = { key: string; label: string; kind: ColumnKind };
export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;

export type Report = {
  name: string;
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  /** Raw values: money in paise, shares in basis points, dates as YYYY-MM-DD. */
  rows: ReportRow[];
  /** A final totals row, if the report has one. */
  totals?: ReportRow | null;
  notes?: string[];
  /** True when the row list was cut short (PDF and screen limits). */
  truncated?: boolean;
};

/** Exact rupees text from paise ("1234.50", "-0.05"), with no floating point. For spreadsheets. */
export function rupeesPlain(paise: number): string {
  if (!Number.isSafeInteger(paise)) throw new RangeError("paise must be an integer");
  const abs = Math.abs(paise);
  return `${paise < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Basis points as a percentage: 1235 gives "12.35%". */
export function formatBp(bp: number): string {
  const n = Math.round(bp);
  const abs = Math.abs(n);
  return `${n < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}%`;
}

/** 1234567 gives "12,34,567" (Indian digit grouping). */
function indianInt(n: number): string {
  const s = String(Math.abs(Math.trunc(n)));
  const head = s.slice(0, -3);
  const grouped = (head ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : "") + s.slice(-3);
  return `${n < 0 ? "-" : ""}${grouped}`;
}

/** The text a person reads on screen or in the PDF. `symbol` is "₹" on screen and "Rs " in the PDF. */
export function displayCell(col: ReportColumn, v: ReportCell | undefined, symbol = "₹"): string {
  if (v === null || v === undefined) return "";
  switch (col.kind) {
    case "paise":
      return formatPaise(Number(v), symbol);
    case "int":
      return indianInt(Number(v));
    case "percent_bp":
      return formatBp(Number(v));
    default:
      return String(v);
  }
}

function csvCell(col: ReportColumn, v: ReportCell | undefined) {
  if (v === null || v === undefined) return null;
  switch (col.kind) {
    case "paise":
      return { raw: rupeesPlain(Number(v)) };
    case "percent_bp":
      return { raw: formatBp(Number(v)) };
    case "int":
      return Number(v);
    default:
      return String(v);
  }
}

/** The report as an Excel-friendly CSV: exact rupee amounts, formulas neutralised, totals as the last row. */
export function reportToCsv(r: Report): string {
  const body = [...r.rows, ...(r.totals ? [r.totals] : [])];
  return toCsv(
    r.columns.map((c) => c.label),
    body.map((row) => r.columns.map((c) => csvCell(c, row[c.key]))),
  );
}
