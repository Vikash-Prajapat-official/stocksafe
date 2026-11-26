import fc from "fast-check";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("writes a header and rows with CRLF line ends and a UTF-8 BOM for Excel", () => {
    const out = toCsv(["name", "qty"], [["Paracetamol", 10], ["Zinc", 5]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out.slice(1)).toBe("name,qty\r\nParacetamol,10\r\nZinc,5\r\n");
  });

  it("quotes commas, quotes and line breaks", () => {
    const out = toCsv(["a"], [['He said "hi", ok'], ["line1\nline2"]]);
    expect(out.slice(1)).toBe('a\r\n"He said ""hi"", ok"\r\n"line1\nline2"\r\n');
  });

  it("prints empty cells for null and undefined", () => {
    expect(toCsv(["a", "b"], [[null, undefined]]).slice(1)).toBe("a,b\r\n,\r\n");
  });

  it("keeps Hindi text intact", () => {
    expect(toCsv(["नाम"], [["आयरन टैबलेट"]]).slice(1)).toBe("नाम\r\nआयरन टैबलेट\r\n");
  });

  it.each(["=SUM(A1:A9)", "+1+1", "-2+3", "@cmd", "\tTAB", "\rCR"])("neutralises spreadsheet formulas: %j", (text) => {
    const cell = (Papa.parse<string[]>(toCsv(["x"], [[text]]).slice(1)).data[1] ?? [])[0];
    expect(cell?.startsWith("'")).toBe(true);
  });

  it("does not alter real negative numbers (they are numbers, not text)", () => {
    expect(toCsv(["v"], [[-5]]).slice(1)).toBe("v\r\n-5\r\n");
  });

  it("round-trips any text through a CSV parser (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.string({ maxLength: 15 }), { minLength: 2, maxLength: 2 }), { minLength: 1, maxLength: 8 }), (rows) => {
        const parsed = Papa.parse<string[]>(toCsv(["a", "b"], rows).slice(1), { skipEmptyLines: false }).data;
        const body = parsed.slice(1).filter((r) => !(r.length === 1 && r[0] === ""));
        expect(body.length).toBe(rows.length);
        rows.forEach((row, i) =>
          row.forEach((cell, j) => {
            const got = body[i]?.[j] ?? "";
            const guarded = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
            // Papa normalises bare \r and \r\n inside quoted cells differently; compare ignoring that
            expect(got.replace(/\r\n?/g, "\n")).toBe(guarded.replace(/\r\n?/g, "\n"));
          }),
        );
      }),
      { numRuns: 200 },
    );
  });
});
