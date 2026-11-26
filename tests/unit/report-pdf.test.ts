import { describe, expect, it } from "vitest";
import { renderReportPdf } from "@/lib/pdf/report-pdf";
import type { Report } from "@/lib/report-format";

const columns: Report["columns"] = [
  { key: "item", label: "Item", kind: "text" },
  { key: "unit", label: "Unit", kind: "text" },
  { key: "qty", label: "Quantity", kind: "int" },
  { key: "value", label: "Value", kind: "paise" },
];
const make = (rows: Report["rows"], totals: Report["totals"] = null): Report => ({
  name: "stock",
  title: "Stock on hand",
  subtitle: "All stores",
  columns,
  rows,
  totals,
  notes: ["Values are at cost price."],
});
const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;

describe("renderReportPdf", () => {
  it("produces a real PDF for a small report", async () => {
    const pdf = await renderReportPdf(make([{ item: "Paracetamol 500 mg", unit: "tablet", qty: 1200, value: 2400000 }], { item: "Total", unit: null, qty: 1200, value: 2400000 }), {
      hospitalName: "City Hospital",
      generatedAt: new Date("2026-11-27T04:30:00Z"),
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pages(pdf)).toBeGreaterThanOrEqual(1);
  });

  it("flows a long report onto several pages", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({ item: `Medicine number ${i} 500 mg`, unit: "tablet", qty: i, value: i * 100 }));
    const pdf = await renderReportPdf(make(rows), { hospitalName: "City Hospital", generatedAt: new Date() });
    expect(pages(pdf)).toBeGreaterThanOrEqual(5);
  });

  it("copes with Hindi names, mixed scripts, an empty report and empty cells", async () => {
    const hindi = await renderReportPdf(make([{ item: "आयरन टैबलेट 100 mg (Iron)", unit: "टैबलेट", qty: 5, value: null }, { item: "", unit: "", qty: 0, value: 0 }]), { hospitalName: "सिटी हॉस्पिटल", generatedAt: new Date() });
    expect(hindi.subarray(0, 5).toString()).toBe("%PDF-");
    const empty = await renderReportPdf(make([]), { hospitalName: "City Hospital", generatedAt: new Date() });
    expect(empty.subarray(0, 5).toString()).toBe("%PDF-");
  });
}, 120_000);
