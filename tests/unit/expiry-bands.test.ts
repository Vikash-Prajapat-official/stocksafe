import { describe, expect, it } from "vitest";
import { bandOf, daysLeft, makeBands, parseBands, summarizeBands } from "@/lib/expiry-bands";

describe("parseBands (EXPIRY_ALERT_DAYS)", () => {
  it("sorts ascending and removes duplicates", () => {
    expect(parseBands("90,60,30")).toEqual([30, 60, 90]);
    expect(parseBands("30, 30 ,90")).toEqual([30, 90]);
  });
  it("falls back to 30,60,90 for missing or invalid values", () => {
    for (const bad of [undefined, "", "abc", "0,-5", "1.5", "9999"]) expect(parseBands(bad)).toEqual([30, 60, 90]);
  });
  it("ignores individual bad entries but keeps good ones", () => {
    expect(parseBands("45,abc,120")).toEqual([45, 120]);
  });
});

describe("daysLeft", () => {
  it("counts calendar days; 0 = expires today, negative = already expired", () => {
    expect(daysLeft("2026-06-15", "2026-06-15")).toBe(0);
    expect(daysLeft("2026-06-16", "2026-06-15")).toBe(1);
    expect(daysLeft("2026-06-14", "2026-06-15")).toBe(-1);
    expect(daysLeft(new Date("2026-09-13T00:00:00Z"), "2026-06-15")).toBe(90);
  });
});

describe("bands", () => {
  const bands = makeBands([30, 60, 90]);

  it("makes an Expired band plus one band per limit, without overlaps", () => {
    expect(bands.map((b) => b.key)).toEqual(["expired", "d30", "d60", "d90"]);
    expect(bands.map((b) => b.label)).toEqual(["Expired", "Within 30 days", "31 to 60 days", "61 to 90 days"]);
  });

  it.each([
    [-1, "expired"],
    [-400, "expired"],
    [0, "d30"],
    [30, "d30"],
    [31, "d60"],
    [60, "d60"],
    [61, "d90"],
    [90, "d90"],
  ])("%s days left is in %s", (days, key) => {
    expect(bandOf(days, bands)?.key).toBe(key);
  });

  it("returns null beyond the last band (not near expiry)", () => {
    expect(bandOf(91, bands)).toBeNull();
  });

  it("summarises count and value per band, including empty bands", () => {
    const rows = [
      { daysLeft: -5, valuePaise: 1000 },
      { daysLeft: -1, valuePaise: 500 },
      { daysLeft: 10, valuePaise: 250 },
      { daysLeft: 75, valuePaise: 4000 },
      { daysLeft: 200, valuePaise: 999 }, // outside every band
    ];
    expect(summarizeBands(rows, bands)).toEqual([
      { key: "expired", count: 2, valuePaise: 1500 },
      { key: "d30", count: 1, valuePaise: 250 },
      { key: "d60", count: 0, valuePaise: 0 },
      { key: "d90", count: 1, valuePaise: 4000 },
    ]);
  });

  it("works with custom limits", () => {
    const b = makeBands([14, 45]);
    expect(b.map((x) => x.label)).toEqual(["Expired", "Within 14 days", "15 to 45 days"]);
    expect(bandOf(15, b)?.key).toBe("d45");
  });
});
