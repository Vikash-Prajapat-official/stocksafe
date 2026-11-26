// Money is always an integer number of paise. Never use floats for rupees.

/** Largest amount a 32-bit database column can hold (about Rs 2.1 crore). */
export const MAX_PAISE = 2_147_483_647;

const VALID = /^(?:\d{1,3}(?:,\d{2,3})*|\d+)?(?:\.\d{1,2})?$/;

/**
 * Parses text such as "12", "12.5", "₹1,234.50" or "Rs. 99" to paise using string maths only.
 * Returns null for anything else (negative, 3+ decimals, letters, too large).
 */
export function parseRupees(input: string): number | null {
  const s = input.trim().replace(/^(?:₹|rs\.?|inr)\s*/i, "");
  if (s === "" || s === "." || !VALID.test(s)) return null;
  const [whole = "", frac = ""] = s.replace(/,/g, "").split(".");
  const paise = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0") || "0");
  return Number.isSafeInteger(paise) && paise <= MAX_PAISE ? paise : null;
}

/** "₹12,34,567.00": Indian digit grouping (last three digits, then pairs). Pass "Rs " where ₹ cannot be printed. */
export function formatPaise(paise: number, symbol = "₹"): string {
  if (!Number.isSafeInteger(paise)) throw new RangeError("paise must be an integer");
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = String(Math.floor(abs / 100));
  const frac = String(abs % 100).padStart(2, "0");
  const head = rupees.slice(0, -3);
  const grouped = (head ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : "") + rupees.slice(-3);
  return `${sign}${symbol}${grouped}.${frac}`;
}

/** quantity x unit price in paise (stock value, write-off value). Exact integer maths. */
export function lineValuePaise(quantity: number, paisePerUnit: number): number {
  if (!Number.isInteger(quantity) || quantity < 0) throw new RangeError("quantity must be a whole number, 0 or more");
  if (!Number.isInteger(paisePerUnit) || paisePerUnit < 0) throw new RangeError("price must be whole paise, 0 or more");
  const v = quantity * paisePerUnit;
  if (!Number.isSafeInteger(v)) throw new RangeError("value is too large");
  return v;
}
