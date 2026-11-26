// Expiry bands for the expiry centre and dashboard. Pure.

import { toDay } from "@/lib/fefo";

export const DEFAULT_BAND_DAYS = [30, 60, 90];

/** Reads EXPIRY_ALERT_DAYS ("90,60,30"). Bad or missing input gives 30,60,90. Sorted ascending. */
export function parseBands(env: string | undefined): number[] {
  const days = (env ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number)
    .filter((n) => n > 0 && n <= 730);
  const unique = [...new Set(days)].sort((a, b) => a - b);
  return unique.length ? unique : [...DEFAULT_BAND_DAYS];
}

/** Calendar days from `today` to the expiry date: 0 = expires today, negative = already expired. */
export function daysLeft(expiry: string | Date, today: string): number {
  return Math.round((Date.parse(`${toDay(expiry)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export type Band = { key: string; label: string; minDays: number | null; maxDays: number };

/** "Expired", then one band per limit with no overlap: Within 30 days, 31 to 60 days, 61 to 90 days. */
export function makeBands(limits: number[]): Band[] {
  const bands: Band[] = [{ key: "expired", label: "Expired", minDays: null, maxDays: -1 }];
  let prev = -1;
  for (const d of limits) {
    bands.push({
      key: `d${d}`,
      label: prev < 0 ? `Within ${d} days` : `${prev + 1} to ${d} days`,
      minDays: prev + 1,
      maxDays: d,
    });
    prev = d;
  }
  return bands;
}

/** The band a stock line falls in, or null when it is further from expiry than the last band. */
export function bandOf(days: number, bands: Band[]): Band | null {
  return bands.find((b) => days <= b.maxDays && (b.minDays === null || days >= b.minDays)) ?? null;
}

export function summarizeBands(rows: { daysLeft: number; valuePaise: number }[], bands: Band[]) {
  return bands.map((b) => {
    const inBand = rows.filter((r) => bandOf(r.daysLeft, bands)?.key === b.key);
    return { key: b.key, count: inBand.length, valuePaise: inBand.reduce((s, r) => s + r.valuePaise, 0) };
  });
}
