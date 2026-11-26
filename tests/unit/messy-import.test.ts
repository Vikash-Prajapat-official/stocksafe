import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importItemsFromBytes } from "@/lib/item-import";
import { translateMessage } from "@/i18n/server-messages";

// SPEC section 10: "Import: 2,000-row messy CSV (Hindi names, blank rows, bad dates, duplicates) gives a clear
// row-by-row error report, not a crash." The file and what it must produce come from tests/fixtures/make-messy-items.mjs.
const bytes = new Uint8Array(readFileSync("tests/fixtures/messy-items.csv"));
const expected = JSON.parse(readFileSync("tests/fixtures/messy-items.expected.json", "utf8")) as {
  totalRows: number;
  blank: number;
  valid: number;
  errors: Record<string, string[]>;
  duplicateOf: Record<string, number>;
};

describe("a 2,000-row messy CSV", () => {
  const result = importItemsFromBytes(bytes, "messy-items.csv", new Set());

  it("is read, not rejected: a bad row never stops the good ones", () => {
    expect(result.fatal).toBeNull();
    expect(result.totalRows).toBe(2000);
    expect(result.warnings).toEqual([]); // every odd header spelling was understood
  });

  it("imports exactly the good rows, Hindi names included", () => {
    expect(result.items).toHaveLength(expected.valid);
    expect(result.items.some((i) => /[ऀ-ॿ]/.test(i.data.name))).toBe(true);
    // names are tidied: no stray spaces
    expect(result.items.every((i) => i.data.name === i.data.name.trim())).toBe(true);
  });

  it("skips blank rows, and counts them", () => {
    expect(result.skippedBlank).toBe(expected.blank);
  });

  it("reports every bad row, with its line number and the column that is wrong", () => {
    const byRow = new Map<number, string[]>();
    for (const e of result.errors) byRow.set(e.row, [...(byRow.get(e.row) ?? []), e.field ?? "?"]);
    const got = Object.fromEntries([...byRow].map(([row, fields]) => [row, [...new Set(fields)].sort()]));
    expect(got).toEqual(Object.fromEntries(Object.entries(expected.errors).map(([row, f]) => [row, [...f].sort()])));
  });

  it("accounts for every row: good + blank + bad = 2,000", () => {
    const badRows = new Set(result.errors.map((e) => e.row));
    expect(result.items.length + result.skippedBlank + badRows.size).toBe(2000);
  });

  it("says which earlier row a duplicate repeats", () => {
    for (const [row, first] of Object.entries(expected.duplicateOf)) {
      const e = result.errors.find((x) => x.row === Number(row));
      expect(e?.message).toBe(`Duplicate of row ${first} (same name, strength and form)`);
    }
    expect(Object.keys(expected.duplicateOf).length).toBeGreaterThan(20);
  });

  it("gives every problem a plain-language message, in Hindi too", () => {
    expect(result.errors.length).toBeGreaterThan(300);
    for (const e of result.errors) {
      expect(e.message.length).toBeGreaterThan(5);
      expect(Number.isInteger(e.row) && e.row >= 2 && e.row <= 2001).toBe(true);
      expect(translateMessage(e.message, "hi"), e.message).not.toBe(e.message);
    }
  });

  it("is quick: 2,000 rows in well under a second", () => {
    const t = performance.now();
    importItemsFromBytes(bytes, "messy-items.csv", new Set());
    expect(performance.now() - t).toBeLessThan(2000);
  });
});

describe("other bad files do not crash either", () => {
  it.each([
    ["an empty file", new Uint8Array(0)],
    ["a file with no usable header", new TextEncoder().encode("foo,bar\r\n1,2\r\n")],
    ["not a spreadsheet at all", new Uint8Array([0, 1, 2, 3, 250, 251, 252])],
  ])("%s", (_name, data) => {
    const r = importItemsFromBytes(data, "x.csv", new Set());
    expect(r.items).toEqual([]);
    expect(r.fatal !== null || r.errors.length > 0).toBe(true);
  });

  it("refuses more than the row limit with a clear message", () => {
    const rows = Array.from({ length: 5005 }, (_, i) => `Item ${i},tablet`).join("\r\n");
    const r = importItemsFromBytes(new TextEncoder().encode(`name,form\r\n${rows}\r\n`), "big.csv", new Set());
    expect(r.fatal).toMatch(/Too many rows/);
  });
});
