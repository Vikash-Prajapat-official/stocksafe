// Turns a finished (English) report into the language of the reader. The engines in reports.ts stay in one language,
// so the SQL and JS engines can be compared exactly; the words are swapped here, for the screen, the CSV and the PDF alike.
// Numbers, dates and money are left exactly as they are (digits stay 0-9 with Indian grouping).

import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import type { Locale } from "@/i18n/locale";
import type { Report, ReportCell } from "@/lib/report-format";

type ReportText = { strings: Record<string, string> } & Record<string, string | Record<string, string>>;
const TEXT: Record<Locale, ReportText> = { en: en.reportText as unknown as ReportText, hi: hi.reportText as unknown as ReportText };

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** One translator for the report words of a language. Unknown text is returned unchanged. */
export function reportTranslator(locale: Locale) {
  const text = TEXT[locale];
  const strings = text.strings;
  const tpl = (k: string) => text[k] as string;

  const word = (s: string): string => {
    if (strings[s]) return strings[s]!;
    let m = /^Within (\d+) days$/.exec(s);
    if (m) return fill(tpl("within"), { days: m[1]! });
    m = /^(\d+) to (\d+) days$/.exec(s);
    if (m) return fill(tpl("range"), { from: m[1]!, to: m[2]! });
    return s;
  };

  const subtitle = (s: string): string => {
    const D = "(\\d{4}-\\d{2}-\\d{2})";
    let m = new RegExp(`^(.*), as of ${D}, within (\\d+) days$`).exec(s);
    if (m) return fill(tpl("subAsOfWithin"), { where: word(m[1]!), date: m[2]!, days: m[3]! });
    m = new RegExp(`^(.*), as of ${D}$`).exec(s);
    if (m) return fill(tpl("subAsOf"), { where: word(m[1]!), date: m[2]! });
    m = /^(.*), last (\d+) months? \(from (\d{4}-\d{2})\)$/.exec(s);
    if (m) return fill(tpl("subMonths"), { where: word(m[1]!), n: m[2]!, from: m[3]! });
    m = /^(.*), consumption value over the last (\d+) months?$/.exec(s);
    if (m) return fill(tpl("subAbc"), { where: word(m[1]!), n: m[2]! });
    m = new RegExp(`^(.*), last (\\d+) days? \\(${D} to ${D}\\)$`).exec(s);
    if (m) return fill(tpl("subDays"), { where: word(m[1]!), n: m[2]!, from: m[3]!, to: m[4]! });
    return s;
  };

  return { word, subtitle };
}

const cell = (c: ReportCell | undefined, word: (s: string) => string): ReportCell | undefined => (typeof c === "string" ? word(c) : c);

export function localizeReport(r: Report, locale: Locale): Report {
  if (locale === "en") return r;
  const { word, subtitle } = reportTranslator(locale);
  const textKeys = r.columns.filter((c) => c.kind === "text").map((c) => c.key);
  const row = (x: Record<string, ReportCell>) => {
    const out: Record<string, ReportCell> = { ...x };
    for (const k of textKeys) if (k in out) out[k] = cell(out[k], word) as ReportCell;
    return out;
  };
  return {
    ...r,
    title: word(r.title),
    subtitle: subtitle(r.subtitle),
    columns: r.columns.map((c) => ({ ...c, label: word(c.label) })),
    rows: r.rows.map(row),
    totals: r.totals ? row(r.totals) : r.totals,
    notes: r.notes?.map(word),
  };
}
