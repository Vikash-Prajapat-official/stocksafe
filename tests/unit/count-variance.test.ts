import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { lineVariance, summarizeVariance } from "@/lib/count-variance";

describe("lineVariance", () => {
  it("is counted minus system, valued at cost in paise (negative = shortage)", () => {
    expect(lineVariance({ systemQty: 100, countedQty: 92, costPaise: 1999 })).toEqual({ counted: true, units: -8, valuePaise: -15992 });
    expect(lineVariance({ systemQty: 10, countedQty: 13, costPaise: 250 })).toEqual({ counted: true, units: 3, valuePaise: 750 });
    expect(lineVariance({ systemQty: 5, countedQty: 5, costPaise: 999 })).toEqual({ counted: true, units: 0, valuePaise: 0 });
  });

  it("treats an uncounted line (null) as not counted, with no variance", () => {
    expect(lineVariance({ systemQty: 5, countedQty: null, costPaise: 999 })).toEqual({ counted: false, units: 0, valuePaise: 0 });
  });

  it("counting zero against stock is a full shortage", () => {
    expect(lineVariance({ systemQty: 4, countedQty: 0, costPaise: 100 })).toMatchObject({ units: -4, valuePaise: -400 });
  });
});

describe("summarizeVariance", () => {
  const lines = [
    { systemQty: 100, countedQty: 92, costPaise: 1000 }, // -8  => -8000
    { systemQty: 10, countedQty: 13, costPaise: 500 }, //  +3  => +1500
    { systemQty: 7, countedQty: 7, costPaise: 300 }, //   match
    { systemQty: 9, countedQty: null, costPaise: 300 }, // not counted
  ];

  it("counts lines and totals gain, loss and net", () => {
    expect(summarizeVariance(lines)).toEqual({
      total: 4,
      counted: 3,
      uncounted: 1,
      matching: 1,
      over: 1,
      short: 1,
      gainPaise: 1500,
      lossPaise: 8000,
      netPaise: -6500,
      netUnits: -5,
    });
  });

  it("is zero for an empty sheet", () => {
    expect(summarizeVariance([])).toEqual({ total: 0, counted: 0, uncounted: 0, matching: 0, over: 0, short: 0, gainPaise: 0, lossPaise: 0, netPaise: 0, netUnits: 0 });
  });

  it("net = gain - loss and the counts add up (property)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            systemQty: fc.integer({ min: 0, max: 500 }),
            countedQty: fc.option(fc.integer({ min: 0, max: 500 }), { nil: null }),
            costPaise: fc.integer({ min: 0, max: 100_000 }),
          }),
          { maxLength: 30 },
        ),
        (ls) => {
          const s = summarizeVariance(ls);
          expect(s.netPaise).toBe(s.gainPaise - s.lossPaise);
          expect(s.counted + s.uncounted).toBe(s.total);
          expect(s.matching + s.over + s.short).toBe(s.counted);
          expect(s.netUnits).toBe(ls.reduce((n, l) => n + (l.countedQty === null ? 0 : l.countedQty - l.systemQty), 0));
        },
      ),
    );
  });
});
