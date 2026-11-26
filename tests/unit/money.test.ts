import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MAX_PAISE, formatPaise, lineValuePaise, parseRupees } from "@/lib/money";

describe("parseRupees (text to integer paise, no floats)", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["0.07", 7],
    [".5", 50],
    ["₹1,234.50", 123450],
    ["Rs. 99", 9900],
    ["  3.10  ", 310],
    ["0", 0],
  ])("%s -> %s", (input, paise) => {
    expect(parseRupees(input)).toBe(paise);
  });

  it.each(["", "abc", "-1", "1.234", "1.2.3", "12,5,0", "1e3", "NaN", "99999999999"])("rejects %j", (input) => {
    expect(parseRupees(input)).toBeNull();
  });

  it("avoids the classic float error (0.1 + 0.2 style)", () => {
    expect(parseRupees("1.15")).toBe(115);
    expect(parseRupees("19.99")).toBe(1999);
    expect(parseRupees("4.35")).toBe(435);
  });
});

describe("formatPaise", () => {
  it.each([
    [0, "₹0.00"],
    [5, "₹0.05"],
    [123450, "₹1,234.50"],
    [123456700, "₹12,34,567.00"], // Indian digit grouping
    [1000000000, "₹1,00,00,000.00"],
  ])("%s -> %s", (paise, text) => {
    expect(formatPaise(paise)).toBe(text);
  });

  it("round-trips through parseRupees for any amount (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_PAISE }), (n) => {
        expect(parseRupees(formatPaise(n))).toBe(n);
      }),
    );
  });
});

describe("lineValuePaise (write-off and stock value)", () => {
  it("multiplies whole units by paise exactly", () => {
    expect(lineValuePaise(12, 1999)).toBe(23988);
    expect(lineValuePaise(0, 1999)).toBe(0);
  });

  it("rejects fractional or negative inputs", () => {
    expect(() => lineValuePaise(1.5, 100)).toThrow(RangeError);
    expect(() => lineValuePaise(-1, 100)).toThrow(RangeError);
    expect(() => lineValuePaise(1, -100)).toThrow(RangeError);
  });

  it("is exact for large but realistic values", () => {
    expect(lineValuePaise(1_000_000, 2_000_000)).toBe(2_000_000_000_000);
  });
});
