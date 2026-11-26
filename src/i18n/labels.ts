// Small helpers for words that the database or the libraries produce in English (expiry bands, enum values).

/** A translate function for one namespace, as next-intl hands out. Kept loose so server and client code can share helpers. */
export type T = (key: string, values?: Record<string, string | number>) => string;

type BandLike = { key: string; minDays: number | null; maxDays: number };

/** "Expired", "Within 30 days", "31 to 60 days" in the language of the user. The t passed in is the "bands" namespace. */
export function bandLabel(t: T, b: BandLike): string {
  if (b.key === "expired") return t("expired");
  if (b.minDays === null || b.minDays === 0) return t("within", { days: b.maxDays });
  return t("range", { from: b.minDays, to: b.maxDays });
}

/** Dates and numbers: Indian grouping, 0-9 digits, India time. */
export function dateTimeFormat(tag: string) {
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}
export function dateFormat(tag: string) {
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "Asia/Kolkata" });
}
/** "2026-03-31" as a calendar date in the chosen language (the string is a plain date, so no time zone shift). */
export function formatDay(tag: string, day: string) {
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}
