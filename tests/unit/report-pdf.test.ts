import { describe, expect, it } from "vitest";
import { renderReportPdf, ReportDocument } from "@/lib/pdf/report-pdf";
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

// A Hindi letter drawn in the Latin font comes out as junk in the PDF, while the file still looks fine to a program. So
// walk the document tree and check that every piece of text containing Devanagari is set in the Devanagari font.
type Node = { type: unknown; props: { children?: unknown; style?: unknown; render?: (p: { pageNumber: number; totalPages: number }) => unknown } };
function textRuns(node: unknown, font: string, out: { text: string; font: string }[] = []) {
  if (typeof node === "string" || typeof node === "number") out.push({ text: String(node), font });
  else if (Array.isArray(node)) for (const n of node) textRuns(n, font, out);
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as Node;
    if (typeof el.type === "function") return textRuns((el.type as (p: unknown) => unknown)(el.props), font, out);
    const style = ([] as unknown[]).concat(el.props.style ?? []) as { fontFamily?: string }[];
    const own = style.map((x) => x?.fontFamily).filter(Boolean).pop() ?? font;
    textRuns(el.props.render ? el.props.render({ pageNumber: 1, totalPages: 2 }) : el.props.children, own, out);
  }
  return out;
}

describe("a Hindi PDF", () => {
  const report: Report = {
    name: "stock",
    title: "मौजूदा स्टॉक",
    subtitle: "सभी स्टोर, 2026-11-27 तक",
    columns: [{ key: "item", label: "दवा / सामान", kind: "text" }, { key: "qty", label: "मात्रा", kind: "int" }],
    rows: [{ item: "आयरन टैबलेट 100 mg", qty: 5 }],
    totals: { item: "कुल", qty: 5 },
    notes: ["मूल्य लागत पर हैं।"],
    truncated: true,
  };
  const runs = textRuns(ReportDocument({ report, hospitalName: "सिटी हॉस्पिटल", generatedAt: new Date("2026-11-27T04:30:00Z"), locale: "hi" }), "NotoLatin");
  const all = runs.map((r) => r.text).join(" ");

  it("sets every Hindi piece of text in the Devanagari font: title, headings, notes and footer included", () => {
    const wrong = runs.filter((r) => /[ऀ-ॿ]/.test(r.text) && r.font !== "NotoDev").map((r) => r.text);
    expect(wrong).toEqual([]);
    for (const word of ["मौजूदा", "सभी", "मात्रा", "कुल", "लागत"]) expect(all).toContain(word);
  });

  it("has its own fixed wording in Hindi too", () => {
    expect(all).not.toMatch(/Generated|India time|Only the first|page /);
    expect(all).toContain("पृष्ठ");
  });

  it("keeps the English wording for an English reader", () => {
    const en = textRuns(ReportDocument({ report: { ...report, title: "Stock on hand" }, hospitalName: "City", generatedAt: new Date(), locale: "en" }), "NotoLatin").map((r) => r.text).join("");
    expect(en).toContain("Generated");
    expect(en).toContain("page 1 of 2");
  });
});
