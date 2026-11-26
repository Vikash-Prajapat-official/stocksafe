const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/**
 * Normalises an Indian mobile number to its 10 digits, or returns null if it is not valid.
 * Accepts spaces, dashes, +91 / 0091 / 91 / 0 prefixes and Devanagari digits.
 */
export function normalizePhone(input: string): string | null {
  let d = input
    .normalize("NFKC")
    .replace(/[०-९]/g, (c) => String(DEVANAGARI_DIGITS.indexOf(c)))
    .replace(/[\s\-().]/g, "");
  if (d.startsWith("+91")) d = d.slice(3);
  else if (d.startsWith("0091")) d = d.slice(4);
  else if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
