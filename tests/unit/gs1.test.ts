import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseGs1 } from "@/lib/gs1";

const GS = "\x1d";

describe("parseGs1", () => {
  it("reads human-readable (AI) form", () => {
    expect(parseGs1("(01)09506000134352(17)271231(10)AB123")).toMatchObject({
      isGs1: true,
      gtin: "09506000134352",
      expiry: "2027-12-31",
      batchNo: "AB123",
    });
  });

  it("reads the raw concatenated form with a group separator after the variable-length batch", () => {
    const code = `0109506000134352` + `17271231` + `10AB123` + GS + `21SERIAL9`;
    expect(parseGs1(code)).toMatchObject({ gtin: "09506000134352", expiry: "2027-12-31", batchNo: "AB123", serial: "SERIAL9" });
  });

  it("reads a batch that is the last element (no separator)", () => {
    expect(parseGs1("01095060001343521727123110LOT-7/B")).toMatchObject({ batchNo: "LOT-7/B", expiry: "2027-12-31" });
  });

  it("strips the symbology identifier some scanners prepend", () => {
    expect(parseGs1("]d2" + "0109506000134352" + "17271231" + "10X1")).toMatchObject({ gtin: "09506000134352", batchNo: "X1" });
  });

  it("day 00 means the last day of the month (leap years too)", () => {
    expect(parseGs1("(17)270200").expiry).toBe("2027-02-28");
    expect(parseGs1("(17)280200").expiry).toBe("2028-02-29");
    expect(parseGs1("(17)261100").expiry).toBe("2026-11-30");
  });

  it("ignores impossible dates", () => {
    expect(parseGs1("(17)271301").expiry).toBeUndefined();
    expect(parseGs1("(17)270231").expiry).toBeUndefined();
  });

  it("uses best-before (15) when there is no expiry (17), and ignores production date (11)", () => {
    expect(parseGs1("(11)250101(15)270630").expiry).toBe("2027-06-30");
    expect(parseGs1("(11)250101").expiry).toBeUndefined();
  });

  it("treats a plain EAN-13 / UPC / EAN-8 as a GTIN padded to 14 digits", () => {
    expect(parseGs1("8901234567890")).toEqual({ raw: "8901234567890", isGs1: false, gtin: "08901234567890" });
    expect(parseGs1("12345670").gtin).toBe("00000012345670");
  });

  it("returns nothing useful for ordinary text", () => {
    expect(parseGs1("hello world")).toEqual({ raw: "hello world", isGs1: false });
    expect(parseGs1("")).toEqual({ raw: "", isGs1: false });
  });

  it("never throws on arbitrary input (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (s) => {
        const r = parseGs1(s);
        expect(r.raw).toBe(s);
        if (r.expiry) expect(r.expiry).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        if (r.gtin) expect(r.gtin).toMatch(/^\d{14}$/);
      }),
      { numRuns: 500 },
    );
  });
});
