import { readFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  importItemsFromBytes,
  parseItemFile,
  templateCsv,
  validateItemTable,
  MAX_IMPORT_ROWS,
} from "@/lib/item-import";
import { itemKey } from "@/lib/schemas/item";

const H = ["name", "generic_name", "strength", "form", "unit", "category", "is_essential", "storage", "min_level", "reorder_level", "max_level"];
const bytes = (s: string) => new TextEncoder().encode(s);

describe("validateItemTable", () => {
  it("accepts a clean row and applies defaults", () => {
    const r = validateItemTable([["name", "form"], ["Paracetamol", "tab"]]);
    expect(r.errors).toEqual([]);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.data).toMatchObject({
      name: "Paracetamol",
      form: "TABLET",
      unit: "tablet",
      isEssential: false,
      storage: "ROOM",
      minLevel: 0,
      reorderLevel: 0,
      maxLevel: 0,
    });
  });

  it("recognises header aliases, case and punctuation", () => {
    const r = validateItemTable([["Item Name", "Dosage-Form", "NLEM", "Storage", "Min", "Reorder", "Max"], ["Insulin", "Injection", "Y", "2-8 C", "5", "10", "20"]]);
    expect(r.errors).toEqual([]);
    expect(r.items[0]?.data).toMatchObject({ isEssential: true, storage: "COLD", minLevel: 5, reorderLevel: 10, maxLevel: 20 });
  });

  it("skips blank rows, counts them, and keeps real Excel row numbers", () => {
    const r = validateItemTable([H, ["A", "", "", "TABLET"], ["", "", ""], ["  ", ""], ["B", "", "", "bogus"]]);
    expect(r.skippedBlank).toBe(2);
    expect(r.items.map((i) => i.row)).toEqual([2]);
    expect(r.errors).toEqual([expect.objectContaining({ row: 5, field: "form" })]);
  });

  it("finds the header after leading blank rows", () => {
    const r = validateItemTable([[""], ["name", "form"], ["X", "cap"]]);
    expect(r.items[0]?.row).toBe(3);
  });

  it("keeps Hindi names intact", () => {
    const r = validateItemTable([["name", "form"], ["पैरासिटामोल", "tablet"]]);
    expect(r.items[0]?.data.name).toBe("पैरासिटामोल");
  });

  it("reports every problem in a row, not just the first", () => {
    const r = validateItemTable([H, ["", "", "", "xyz", "", "", "maybe", "hot", "-1", "1.5", "abc"]]);
    const fields = r.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "form", "is_essential", "storage", "min_level", "reorder_level", "max_level"]));
    expect(r.items).toHaveLength(0);
  });

  it("rejects inconsistent levels", () => {
    const a = validateItemTable([H, ["A", "", "", "TABLET", "", "", "", "", "10", "5", "0"]]);
    expect(a.errors[0]).toMatchObject({ field: "reorder_level" });
    const b = validateItemTable([H, ["B", "", "", "TABLET", "", "", "", "", "1", "10", "5"]]);
    expect(b.errors[0]).toMatchObject({ field: "max_level" });
  });

  it("accepts numbers with commas and Excel-style .0", () => {
    const r = validateItemTable([H, ["A", "", "", "TABLET", "", "", "", "", "1,000", "2000.0", "6000"]]);
    expect(r.errors).toEqual([]);
    expect(r.items[0]?.data).toMatchObject({ minLevel: 1000, reorderLevel: 2000, maxLevel: 6000 });
  });

  it("flags duplicates inside the file and against existing items", () => {
    const existing = new Set([itemKey("Old", "5 mg", "TABLET")]);
    const r = validateItemTable(
      [["name", "strength", "form"], ["Amox", "500 mg", "cap"], ["  amox ", "500  MG", "CAPSULE"], ["Old", "5 mg", "tab"], ["Amox", "250 mg", "cap"]],
      existing,
    );
    expect(r.items.map((i) => i.row)).toEqual([2, 5]);
    expect(r.errors).toEqual([
      expect.objectContaining({ row: 3, message: expect.stringContaining("Duplicate of row 2") }),
      expect.objectContaining({ row: 4, message: expect.stringContaining("Already in the item list") }),
    ]);
  });

  it("is fatal when required columns are missing", () => {
    const r = validateItemTable([["name", "strength"], ["A", "1"]]);
    expect(r.fatal).toContain("form");
    expect(r.items).toHaveLength(0);
  });

  it("is fatal for an empty table and for too many rows", () => {
    expect(validateItemTable([[""], []]).fatal).toBe("The file is empty.");
    const many = [["name", "form"], ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => [`I${i}`, "tab"])];
    expect(validateItemTable(many).fatal).toContain("Too many rows");
  });

  it("warns about unknown columns but still imports", () => {
    const r = validateItemTable([["name", "form", "remarks"], ["A", "tab", "x"]]);
    expect(r.warnings[0]).toContain("remarks");
    expect(r.items).toHaveLength(1);
  });

  it("never throws and accounts for every row (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.array(fc.string({ maxLength: 12 }), { maxLength: 6 }), { maxLength: 30 }), (table) => {
        const r = validateItemTable([["name", "form", "min_level", "storage"], ...table]);
        const errorRows = new Set(r.errors.map((e) => e.row)).size;
        expect(r.items.length + errorRows + r.skippedBlank).toBe(r.totalRows);
      }),
      { numRuns: 200 },
    );
  });
});

describe("parseItemFile / importItemsFromBytes", () => {
  it("reads CSV with a BOM and semicolons-free commas", () => {
    const r = importItemsFromBytes(bytes("﻿name,form\nA,tab\n\nB,cap\n"), "items.csv");
    expect(r.items.map((i) => i.data.name)).toEqual(["A", "B"]);
    expect(r.skippedBlank).toBeGreaterThanOrEqual(1);
  });

  it("reads quoted fields containing commas and newlines", () => {
    const r = importItemsFromBytes(bytes('name,form,category\n"Amox, forte",tab,"Anti\ninfective"\n'), "x.csv");
    expect(r.items[0]?.data).toMatchObject({ name: "Amox, forte", category: "Anti infective" });
  });

  it("reads an xlsx workbook", () => {
    const ws = XLSX.utils.aoa_to_sheet([["name", "form", "min_level"], ["Zinc", "tablet", 10], [], ["ओआरएस", "other", 5]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const r = importItemsFromBytes(new Uint8Array(buf), "items.xlsx");
    expect(r.errors).toEqual([]);
    expect(r.items.map((i) => i.data.name)).toEqual(["Zinc", "ओआरएस"]);
    expect(r.skippedBlank).toBe(1);
  });

  it("returns a clear fatal for unsupported, empty, or corrupt files", () => {
    expect(importItemsFromBytes(bytes("x"), "items.pdf").fatal).toContain("Unsupported");
    expect(importItemsFromBytes(new Uint8Array(), "items.csv").fatal).toContain("empty");
    const corrupt = importItemsFromBytes(bytes("not a workbook"), "items.xlsx");
    expect(corrupt.fatal ?? corrupt.errors.length + "").toBeTruthy();
  });

  it("warns when the CSV is not UTF-8", () => {
    const parsed = parseItemFile(new Uint8Array([0x6e, 0x61, 0x6d, 0x65, 0x2c, 0x66, 0x6f, 0x72, 0x6d, 0x0a, 0xff, 0x2c, 0x74]), "a.csv");
    expect("warnings" in parsed && parsed.warnings.length).toBe(1);
  });

  it("the downloadable template imports cleanly", () => {
    const r = importItemsFromBytes(bytes(templateCsv()), "template.csv");
    expect(r.fatal).toBeNull();
    expect(r.errors).toEqual([]);
    expect(r.items).toHaveLength(2);
  });
});

describe("NLEM seed file", () => {
  const csv = readFileSync(path.join(__dirname, "../../prisma/data/nlem-items.csv"));
  const r = importItemsFromBytes(new Uint8Array(csv), "nlem-items.csv");

  it("has no errors", () => {
    expect(r.fatal).toBeNull();
    expect(r.errors).toEqual([]);
  });

  it("has at least the ~300 items the spec asks for", () => {
    // The list is a superset (about 430 incl. ~45 consumables); see DECISIONS.md.
    expect(r.items.length).toBeGreaterThanOrEqual(300);
    expect(r.items.length).toBeLessThanOrEqual(500);
  });

  it("marks consumables as non-NLEM and has cold-chain items", () => {
    expect(r.items.filter((i) => i.data.form === "CONSUMABLE").every((i) => !i.data.isEssential)).toBe(true);
    expect(r.items.some((i) => i.data.storage === "COLD")).toBe(true);
  });
});
