import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { abcClassify } from "@/lib/abc";

const items = (values: number[]) => values.map((value, i) => ({ id: `i${i}`, name: `item${i}`, value }));

describe("abcClassify (ABC analysis by consumption value)", () => {
  it("ranks by value and classes A up to 80% of the total, B up to 95%, C the rest", () => {
    const r = abcClassify(items([50, 30, 10, 5, 3, 2]));
    expect(r.map((x) => [x.rank, x.value, x.class])).toEqual([
      [1, 50, "A"],
      [2, 30, "A"],
      [3, 10, "B"], // the first 80% are already used up
      [4, 5, "B"],
      [5, 3, "C"],
      [6, 2, "C"],
    ]);
    expect(r.map((x) => x.cumulativeBp)).toEqual([5000, 8000, 9000, 9500, 9800, 10000]);
    expect(r.map((x) => x.shareBp)).toEqual([5000, 3000, 1000, 500, 300, 200]);
  });

  it("the item that crosses the 80% line is still an A item", () => {
    const r = abcClassify(items([60, 30, 10])); // 60, then 90 (crosses 80), then 100
    expect(r.map((x) => x.class)).toEqual(["A", "A", "B"]);
  });

  it("sorts its input and does not modify it", () => {
    const input = items([2, 9, 5]);
    const copy = structuredClone(input);
    const r = abcClassify(input);
    expect(r.map((x) => x.id)).toEqual(["i1", "i2", "i0"]);
    expect(input).toEqual(copy);
  });

  it("breaks ties by name so the result is repeatable", () => {
    const r = abcClassify([
      { id: "b", name: "Bravo", value: 10 },
      { id: "a", name: "Alpha", value: 10 },
    ]);
    expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("a single item is A with 100%", () => {
    expect(abcClassify(items([7]))).toEqual([{ id: "i0", rank: 1, value: 7, shareBp: 10000, cumulativeBp: 10000, class: "A" }]);
  });

  it("items with no consumption are C, and an all-zero list has no shares", () => {
    const r = abcClassify(items([100, 0, 0]));
    expect(r.map((x) => x.class)).toEqual(["A", "C", "C"]);
    expect(abcClassify(items([0, 0])).map((x) => [x.class, x.shareBp, x.cumulativeBp])).toEqual([["C", 0, 0], ["C", 0, 0]]);
  });

  it("an empty list gives an empty result, and negative values count as zero", () => {
    expect(abcClassify([])).toEqual([]);
    expect(abcClassify(items([-5, 10])).map((x) => x.value)).toEqual([10, 0]);
  });

  it("accepts custom limits", () => {
    const r = abcClassify(items([50, 30, 20]), { a: 50, b: 80 });
    expect(r.map((x) => x.class)).toEqual(["A", "B", "C"]);
  });

  it("is consistent for any values (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 40 }), (values) => {
        const r = abcClassify(items(values));
        expect(r.map((x) => x.rank)).toEqual(values.map((_, i) => i + 1));
        const total = values.reduce((s, v) => s + v, 0);
        for (let i = 1; i < r.length; i++) {
          expect(r[i]!.value).toBeLessThanOrEqual(r[i - 1]!.value); // ranked by value
          expect(r[i]!.cumulativeBp).toBeGreaterThanOrEqual(r[i - 1]!.cumulativeBp);
          expect("ABC".indexOf(r[i]!.class)).toBeGreaterThanOrEqual("ABC".indexOf(r[i - 1]!.class)); // A then B then C
        }
        if (total > 0) {
          expect(r[r.length - 1]!.cumulativeBp).toBe(10000);
          expect(r[0]!.class).toBe("A"); // the biggest item is always A
        }
      }),
      { numRuns: 300 },
    );
  });
});
