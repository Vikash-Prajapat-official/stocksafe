import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { formatBp, reportToCsv, rupeesPlain, displayCell, type Report } from "@/lib/report-format";
import { parseRetentionDays } from "@/lib/retention";

describe("rupeesPlain (exact rupees text from paise, for spreadsheets)", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [123450, "1234.50"],
    [100, "1.00"],
    [2147483647, "21474836.47"],
    [1_000_000_000_000, "10000000000.00"],
    [-5, "-0.05"],
    [-123450, "-1234.50"],
  ])("%s paise is %s", (paise, text) => {
    expect(rupeesPlain(paise)).toBe(text);
  });
  it("rejects non-integers", () => {
    expect(() => rupeesPlain(1.5)).toThrow(RangeError);
  });
});

describe("formatBp", () => {
  it.each([[0, "0.00%"], [1235, "12.35%"], [10000, "100.00%"], [5, "0.05%"]])("%s basis points is %s", (bp, text) => expect(formatBp(bp)).toBe(text));
});

const report: Report = {
  name: "demo",
  title: "Demo report",
  subtitle: "Test",
  columns: [
    { key: "item", label: "Item", kind: "text" },
    { key: "qty", label: "Quantity", kind: "int" },
    { key: "value", label: "Value", kind: "paise" },
    { key: "day", label: "Expiry", kind: "date" },
    { key: "share", label: "Share", kind: "percent_bp" },
  ],
  rows: [
    { item: "Paracetamol, 500 mg", qty: 10, value: 123450, day: "2027-01-31", share: 1235 },
    { item: "=HYPERLINK(\"http://x\")", qty: 0, value: -5, day: null, share: 0 },
    { item: "आयरन टैबलेट", qty: 1_000_000, value: 0, day: "2026-12-01", share: 10000 },
  ],
  totals: { item: "Total", qty: 1_000_010, value: 123445, day: null, share: null },
};

describe("reportToCsv", () => {
  const csv = reportToCsv(report);
  const parsed = Papa.parse<string[]>(csv.replace(/^﻿/, ""), { skipEmptyLines: true }).data;

  it("starts with a BOM, then the header labels", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(parsed[0]).toEqual(["Item", "Quantity", "Value", "Expiry", "Share"]);
  });

  it("writes money as exact rupees (including negatives), integers as digits, and shares as percent", () => {
    expect(parsed[1]).toEqual(["Paracetamol, 500 mg", "10", "1234.50", "2027-01-31", "12.35%"]);
    expect(parsed[2]![2]).toBe("-0.05"); // a real negative amount is not mistaken for a formula
    expect(parsed[3]).toEqual(["आयरन टैबलेट", "1000000", "0.00", "2026-12-01", "100.00%"]);
  });

  it("neutralises a text cell that would be run as a formula", () => {
    expect(parsed[2]![0]!.startsWith("'=HYPERLINK")).toBe(true);
  });

  it("leaves null cells empty and ends with the totals row", () => {
    expect(parsed[2]![3]).toBe("");
    expect(parsed[parsed.length - 1]).toEqual(["Total", "1000010", "1234.45", "", ""]);
  });
});

describe("displayCell (what people read on screen and in the PDF)", () => {
  const col = (kind: Report["columns"][number]["kind"]) => ({ key: "k", label: "K", kind });
  it("formats rupees with Indian digit grouping and the chosen symbol", () => {
    expect(displayCell(col("paise"), 123456700)).toBe("₹12,34,567.00");
    expect(displayCell(col("paise"), 123456700, "Rs ")).toBe("Rs 12,34,567.00");
    expect(displayCell(col("paise"), -5)).toBe("-₹0.05");
  });
  it("formats counts with Indian grouping, dates as given, shares as percent, null as empty", () => {
    expect(displayCell(col("int"), 1234567)).toBe("12,34,567");
    expect(displayCell(col("date"), "2027-01-31")).toBe("2027-01-31");
    expect(displayCell(col("percent_bp"), 1235)).toBe("12.35%");
    expect(displayCell(col("text"), null)).toBe("");
  });
});

describe("parseRetentionDays (RETENTION_DAYS)", () => {
  it("reads a sensible number of days", () => {
    expect(parseRetentionDays("30")).toBe(30);
    expect(parseRetentionDays(" 90 ")).toBe(90);
  });
  it("falls back to 90 for missing or silly values (never silently keeps names forever, never 0)", () => {
    for (const bad of [undefined, "", "abc", "0", "-5", "1.5", "99999"]) expect(parseRetentionDays(bad)).toBe(90);
  });
});
