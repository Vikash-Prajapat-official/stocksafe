import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { splitFefo, todayIST, toDay, type FefoBatch } from "@/lib/fefo";

const TODAY = "2026-06-15";
const b = (batchId: string, expiryDate: string, quantity: number): FefoBatch => ({ batchId, expiryDate, quantity });

describe("splitFefo", () => {
  it("takes from the earliest-expiring batch first", () => {
    const r = splitFefo([b("late", "2027-12-31", 50), b("early", "2026-09-30", 50)], 20, TODAY);
    expect(r).toEqual({ ok: true, picks: [{ batchId: "early", quantity: 20 }] });
  });

  it("splits across batches in expiry order when the first is not enough", () => {
    const r = splitFefo([b("c", "2028-01-01", 100), b("a", "2026-07-01", 6), b("b", "2026-12-01", 10)], 20, TODAY);
    expect(r).toEqual({
      ok: true,
      picks: [
        { batchId: "a", quantity: 6 },
        { batchId: "b", quantity: 10 },
        { batchId: "c", quantity: 4 },
      ],
    });
  });

  it("skips expired batches, even when they are the only stock", () => {
    const r = splitFefo([b("old", "2026-06-14", 100), b("ok", "2027-01-01", 5)], 5, TODAY);
    expect(r).toEqual({ ok: true, picks: [{ batchId: "ok", quantity: 5 }] });
    const none = splitFefo([b("old", "2026-06-14", 100)], 1, TODAY);
    expect(none).toEqual({ ok: false, requested: 1, available: 0, expired: 100 });
  });

  it("a batch is still usable on its expiry date, expired the day after", () => {
    expect(splitFefo([b("x", TODAY, 5)], 5, TODAY).ok).toBe(true);
    expect(splitFefo([b("x", "2026-06-14", 5)], 5, TODAY).ok).toBe(false);
  });

  it("breaks expiry ties by the smaller quantity first, then batch id", () => {
    const r = splitFefo([b("z", "2026-12-31", 30), b("y", "2026-12-31", 10), b("x", "2026-12-31", 10)], 15, TODAY);
    expect(r).toEqual({
      ok: true,
      picks: [
        { batchId: "x", quantity: 10 },
        { batchId: "y", quantity: 5 },
      ],
    });
  });

  it("ignores empty batches", () => {
    const r = splitFefo([b("empty", "2026-07-01", 0), b("full", "2026-08-01", 3)], 3, TODAY);
    expect(r).toEqual({ ok: true, picks: [{ batchId: "full", quantity: 3 }] });
  });

  it("reports how much is available and how much is expired when stock is short", () => {
    const r = splitFefo([b("a", "2026-07-01", 4), b("old", "2026-01-01", 9)], 10, TODAY);
    expect(r).toEqual({ ok: false, requested: 10, available: 4, expired: 9 });
  });

  it("can take exactly everything", () => {
    const r = splitFefo([b("a", "2026-07-01", 4), b("b", "2026-08-01", 6)], 10, TODAY);
    expect(r).toEqual({
      ok: true,
      picks: [
        { batchId: "a", quantity: 4 },
        { batchId: "b", quantity: 6 },
      ],
    });
  });

  it("accepts Date objects as expiry dates and does not mutate its input", () => {
    const input = [b("b", "2026-08-01", 6), { batchId: "a", expiryDate: new Date("2026-07-01T00:00:00Z"), quantity: 4 }];
    const copy = structuredClone(input);
    const r = splitFefo(input, 5, TODAY);
    expect(r).toMatchObject({ ok: true, picks: [{ batchId: "a", quantity: 4 }, { batchId: "b", quantity: 1 }] });
    expect(input).toEqual(copy);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects an invalid requested quantity %s", (q) => {
    expect(() => splitFefo([b("a", "2026-07-01", 4)], q, TODAY)).toThrow(RangeError);
  });

  it("FEFO invariants hold for any stock (property)", () => {
    const batchArb = fc.uniqueArray(
      fc.record({
        batchId: fc.stringMatching(/^[a-f0-9]{6}$/),
        offset: fc.integer({ min: -60, max: 300 }),
        quantity: fc.integer({ min: 0, max: 60 }),
      }),
      { selector: (x) => x.batchId, maxLength: 12 },
    );
    fc.assert(
      fc.property(batchArb, fc.integer({ min: 1, max: 400 }), (raw, requested) => {
        const day = (o: number) => toDay(new Date(Date.parse(`${TODAY}T00:00:00Z`) + o * 86400000));
        const batches = raw.map((x) => b(x.batchId, day(x.offset), x.quantity));
        const usable = batches
          .filter((x) => x.quantity > 0 && String(x.expiryDate) >= TODAY)
          .sort((p, q) => String(p.expiryDate).localeCompare(String(q.expiryDate)) || p.quantity - q.quantity || p.batchId.localeCompare(q.batchId));
        const available = usable.reduce((s, x) => s + x.quantity, 0);
        const r = splitFefo(batches, requested, TODAY);
        if (!r.ok) {
          expect(available).toBeLessThan(requested);
          expect(r.available).toBe(available);
          return;
        }
        expect(available).toBeGreaterThanOrEqual(requested);
        expect(r.picks.reduce((s, p) => s + p.quantity, 0)).toBe(requested);
        // picks are exactly a prefix of the usable batches in FEFO order; all but the last are taken in full
        r.picks.forEach((p, i) => {
          const src = usable[i]!;
          expect(p.batchId).toBe(src.batchId);
          expect(p.quantity).toBeGreaterThan(0);
          expect(p.quantity).toBeLessThanOrEqual(src.quantity);
          if (i < r.picks.length - 1) expect(p.quantity).toBe(src.quantity);
        });
      }),
      { numRuns: 300 },
    );
  });
});

describe("dates", () => {
  it("toDay normalises strings and Dates to YYYY-MM-DD", () => {
    expect(toDay("2026-06-15")).toBe("2026-06-15");
    expect(toDay(new Date("2026-06-15T00:00:00Z"))).toBe("2026-06-15");
  });

  it("todayIST uses the India date, not the UTC date", () => {
    expect(todayIST(new Date("2026-11-26T20:00:00Z"))).toBe("2026-11-27"); // 01:30 IST next day
    expect(todayIST(new Date("2026-11-26T05:00:00Z"))).toBe("2026-11-26");
  });
});
