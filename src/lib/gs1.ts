// Parser for GS1 barcodes (DataMatrix / GS1-128) as printed on medicine packs, plus plain EAN/UPC codes.
// Pure and total: it never throws, and returns only what it could read.

export type Gs1Data = {
  raw: string;
  /** True when the code carried GS1 application identifiers (not just a plain EAN/UPC number). */
  isGs1: boolean;
  /** 14-digit GTIN (plain EAN-13/UPC/EAN-8 codes are left-padded with zeros). */
  gtin?: string;
  /** Expiry as YYYY-MM-DD (from AI 17, or best-before AI 15 when 17 is absent). */
  expiry?: string;
  batchNo?: string;
  serial?: string;
};

const GS = "\x1d"; // FNC1 group separator after variable-length fields
const FIXED: Record<string, number> = { "00": 18, "01": 14, "02": 14, "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6, "20": 2 };
const VARIABLE_MAX: Record<string, number> = { "10": 20, "21": 20, "22": 20, "30": 8, "37": 8, "240": 30, "241": 30, "250": 30, "251": 30 };

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** YYMMDD to YYYY-MM-DD. Day 00 means the last day of the month. Returns undefined if impossible. */
function parseDate(v: string): string | undefined {
  if (!/^\d{6}$/.test(v)) return undefined;
  const year = 2000 + Number(v.slice(0, 2));
  const month = Number(v.slice(2, 4));
  let day = Number(v.slice(4, 6));
  if (month < 1 || month > 12) return undefined;
  const last = daysInMonth(year, month);
  if (day === 0) day = last;
  if (day > last) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Splits a code into [AI, value] pairs; handles "(01)...(17)..." and the raw concatenated form. */
function readElements(s: string): [string, string][] {
  const out: [string, string][] = [];
  if (s.includes("(")) {
    for (const m of s.matchAll(/\((\d{2,4})\)([^(]*)/g)) out.push([m[1]!, m[2]!.replace(/\x1d/g, "").trim()]);
    return out;
  }
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    const two = s.slice(i, i + 2);
    const fixedLen = FIXED[two];
    if (fixedLen !== undefined) {
      const value = s.slice(i + 2, i + 2 + fixedLen);
      if (value.length < fixedLen) break;
      out.push([two, value]);
      i += 2 + fixedLen;
      continue;
    }
    const ai = VARIABLE_MAX[two] !== undefined ? two : VARIABLE_MAX[s.slice(i, i + 3)] !== undefined ? s.slice(i, i + 3) : null;
    if (!ai) break; // unknown identifier: stop rather than guess
    const max = VARIABLE_MAX[ai]!;
    const start = i + ai.length;
    let end = start;
    while (end < s.length && end - start < max && s[end] !== GS) end++;
    if (end === start) break;
    out.push([ai, s.slice(start, end)]);
    i = end;
  }
  return out;
}

export function parseGs1(input: string): Gs1Data {
  const raw = input;
  let s = input.replace(/^\][A-Za-z][0-9A-Za-z]/, "").trim(); // symbology identifier, e.g. "]d2"
  const result: Gs1Data = { raw, isGs1: false };
  if (!s) return result;

  // Plain retail barcode: EAN-8, UPC-A, EAN-13 or GTIN-14 (too short to hold a GS1 element string).
  if (/^\d{8}$|^\d{12,14}$/.test(s)) {
    result.gtin = s.padStart(14, "0");
    return result;
  }

  s = s.replace(/\r|\n/g, "");
  let expiry15: string | undefined;
  for (const [ai, value] of readElements(s)) {
    if (ai === "01" && /^\d{14}$/.test(value)) { result.gtin = value; result.isGs1 = true; }
    else if (ai === "17") { const d = parseDate(value); if (d) result.expiry = d; result.isGs1 = true; }
    else if (ai === "15") { expiry15 = parseDate(value); result.isGs1 = true; }
    else if (ai === "10" && value && value.length <= 20) { result.batchNo = value; result.isGs1 = true; }
    else if (ai === "21" && value && value.length <= 20) { result.serial = value; result.isGs1 = true; }
    else result.isGs1 = true;
  }
  if (!result.expiry && expiry15) result.expiry = expiry15;
  return result;
}
