import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assessReorder } from "@/lib/reorder";

const a = (onHand: number, minLevel: number, reorderLevel: number, maxLevel: number) =>
  assessReorder({ onHand, minLevel, reorderLevel, maxLevel });

describe("assessReorder", () => {
  it("is low when on-hand is below the reorder level, and suggests max minus on-hand", () => {
    expect(a(40, 20, 50, 200)).toEqual({ tracked: true, status: "LOW", belowMin: false, target: 200, suggested: 160 });
  });

  it("is not low when on-hand equals the reorder level (strictly below triggers)", () => {
    expect(a(50, 20, 50, 200)).toMatchObject({ status: "OK", suggested: 0 });
    expect(a(49, 20, 50, 200)).toMatchObject({ status: "LOW", suggested: 151 });
  });

  it("reports a stock-out when nothing is left, and still suggests a quantity", () => {
    expect(a(0, 20, 50, 200)).toEqual({ tracked: true, status: "OUT", belowMin: true, target: 200, suggested: 200 });
  });

  it("flags below the minimum separately from low", () => {
    expect(a(15, 20, 50, 200)).toMatchObject({ status: "LOW", belowMin: true });
    expect(a(25, 20, 50, 200)).toMatchObject({ status: "LOW", belowMin: false });
  });

  it("when no maximum is set, tops up to twice the reorder level", () => {
    expect(a(30, 0, 50, 0)).toMatchObject({ status: "LOW", target: 100, suggested: 70 });
  });

  it("uses the minimum as the trigger when no reorder level is set", () => {
    expect(a(5, 10, 0, 0)).toMatchObject({ tracked: true, status: "LOW", target: 20, suggested: 15 });
    expect(a(10, 10, 0, 0)).toMatchObject({ status: "OK" });
  });

  it("ignores items with no levels at all (levels of 0 mean not set)", () => {
    expect(a(0, 0, 0, 0)).toEqual({ tracked: false, status: "OK", belowMin: false, target: 0, suggested: 0 });
    expect(a(7, 0, 0, 0)).toMatchObject({ tracked: false, status: "OK", suggested: 0 });
  });

  it("never suggests a negative quantity even if the maximum is below on-hand", () => {
    expect(a(60, 0, 100, 50)).toMatchObject({ status: "LOW", suggested: 0 });
  });

  it("is consistent for any levels (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 300 }),
        fc.integer({ min: 0, max: 600 }),
        (onHand, min, reorder, max) => {
          const r = a(onHand, min, reorder, max);
          expect(r.suggested).toBeGreaterThanOrEqual(0);
          if (!r.tracked || r.status === "OK") expect(r.suggested).toBe(0);
          // when it is low, ordering the suggestion brings stock up to the target (or leaves it if already above)
          if (r.status !== "OK") expect(onHand + r.suggested).toBe(Math.max(onHand, r.target));
          if (r.status === "OUT") expect(onHand).toBe(0);
        },
      ),
      { numRuns: 400 },
    );
  });
});
