import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importItemsFromBytes } from "@/lib/item-import";

// The starter item list is shown to hospitals with an "NLEM" mark, so the mark must not creep back onto medicines that
// are not in the National List of Essential Medicines 2022 (checked by name against the official list; see DECISIONS.md).
const items = importItemsFromBytes(new Uint8Array(readFileSync("prisma/data/nlem-items.csv")), "nlem-items.csv", new Set()).items.map((i) => i.data);
const marked = items.filter((i) => i.isEssential);

describe("the starter medicine list", () => {
  it("marks exactly the rows that were confirmed", () => {
    expect(marked).toHaveLength(321);
  });

  it("does not mark medicines that are not in NLEM 2022", () => {
    const notListed = ["Atenolol", "Chlorpheniramine", "Erythromycin", "Losartan", "Famotidine", "Olanzapine", "Methyldopa", "Ofloxacin", "Sucralfate", "Alendronate"];
    for (const name of notListed) {
      expect(items.some((i) => i.name === name), `${name} is still in the list`).toBe(true);
      expect(marked.filter((i) => i.name === name), `${name} must not be marked essential`).toEqual([]);
    }
  });

  it("still marks well-known listed medicines", () => {
    for (const name of ["Amoxicillin", "Amlodipine", "Telmisartan", "Aspirin"]) expect(marked.some((i) => i.name === name), name).toBe(true);
  });
});
