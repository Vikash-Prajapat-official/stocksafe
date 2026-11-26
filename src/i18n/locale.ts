// Languages StockSafe speaks. No URL prefix: the choice is kept in a cookie, so every link and bookmark works in both.
export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", hi: "हिन्दी" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** The cookie wins; with no cookie, a browser that asks for Hindi first gets Hindi. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "hi" || first.startsWith("hi-") ? "hi" : DEFAULT_LOCALE;
}

/** The BCP 47 tag used for dates and numbers. Digits stay 0-9 in both languages (Indian grouping, see DECISIONS.md). */
export const intlTag = (l: Locale) => (l === "hi" ? "hi-IN-u-nu-latn" : "en-IN");
