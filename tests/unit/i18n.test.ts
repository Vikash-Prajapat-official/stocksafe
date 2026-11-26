import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import { pickLocale } from "@/i18n/locale";
import { translateMessage } from "@/i18n/server-messages";
import { localizeReport } from "@/lib/report-i18n";

type Tree = { [k: string]: string | Tree };
const flat = (o: Tree, p = "", out: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries(o)) typeof v === "string" ? (out[p + k] = v) : flat(v, `${p}${k}.`, out);
  return out;
};
const FE = flat(en as Tree);
const FH = flat(hi as Tree);
// the names of the values a message needs: {name} and {name, plural, ...}
const args = (s: string) => [...new Set([...s.matchAll(/\{(\w+)(?:,|\})/g)].map((m) => m[1]!))].sort().join(",");

describe("message files", () => {
  it("English and Hindi have exactly the same keys", () => {
    expect(Object.keys(FH).sort()).toEqual(Object.keys(FE).sort());
  });

  it("every message takes the same values in both languages", () => {
    const bad = Object.keys(FE).filter((k) => args(FE[k]!) !== args(FH[k]!));
    expect(bad).toEqual([]);
  });

  it("no message is empty, and Hindi messages are really in Hindi", () => {
    expect(Object.entries(FH).filter(([, v]) => !v.trim())).toEqual([]);
    // the few that are legitimately language-neutral: file formats, an amount
    const neutral = Object.entries(FH).filter(([k, v]) => !/[ऀ-ॿ]/.test(v) && !k.startsWith("reportText.strings.") && !k.startsWith("reportText.sub"));
    expect(neutral.map(([k]) => k).sort()).toEqual(["common.csv", "common.pdf", "counts.ofTotal", "grn.mrp", "landing.heroAmount", "landing.who.chcs"]);
  });
});

describe("locale choice", () => {
  it("uses the cookie first, then the browser, then English", () => {
    expect(pickLocale("hi", "en-US")).toBe("hi");
    expect(pickLocale("en", "hi-IN,hi;q=0.9")).toBe("en");
    expect(pickLocale(undefined, "hi-IN,hi;q=0.9,en;q=0.8")).toBe("hi");
    expect(pickLocale(undefined, "en-GB")).toBe("en");
    expect(pickLocale("fr", null)).toBe("en");
  });
});

// ---- every message the server can send has a Hindi version ----
function sourceFiles(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.ts$/.test(n)) out.push(p);
  }
  return out;
}

describe("server messages", () => {
  const found = new Map<string, string>();
  const re = /(?:new (?:ApiError|StockError)\(\s*(?:\d+,\s*)?"[A-Z_]+",\s*|\bbad\(\s*|\bmessage:\s*|\.(?:min|max|regex|refine)\([^"`]*?,\s*)("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g;
  for (const f of sourceFiles("src")) {
    if (/src[\\/]i18n/.test(f)) continue;
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(re)) {
      const lit = m[1]!.slice(1, -1).replace(/\\"/g, '"');
      const sample = lit.replace(/^\$\{[^}]*\}/, "Store").replace(/\$\{[^}]*\}/g, "7"); // fill in the placeholders with plausible values
      if (/^[A-Z_]+$/.test(sample) || sample.length < 8 || !sample.includes(" ")) continue; // codes and field names are not sentences
      found.set(sample, f);
    }
  }

  it("finds the messages in the source (so this test cannot silently check nothing)", () => {
    expect(found.size).toBeGreaterThan(60);
  });

  // messages for programmers, never shown to a person in a browser
  const INTERNAL = [/^Store: 7$/, /^paise must be/, /^price must be/, /^value is too large/, /^requested quantity must be/, /^quantity must be a whole number, 0 or more/, /^Request failed/];

  it("every message has a Hindi version", () => {
    const missing = [...found.keys()].filter((m) => !INTERNAL.some((r) => r.test(m)) && translateMessage(m, "hi") === m);
    expect(missing).toEqual([]);
  });

  it("keeps the numbers, names and dates inside the message", () => {
    expect(translateMessage("Only 3 in stock", "hi")).toContain("3");
    expect(translateMessage('Item "Paracetamol 500 mg" is not active', "hi")).toContain("Paracetamol 500 mg");
    expect(translateMessage("Indent #12 is draft, so it cannot be issued", "hi")).toContain("#12");
    expect(translateMessage("name: Name is required; phone: Enter a valid phone number", "hi")).toMatch(/^name: .*; phone: /);
  });

  it("leaves English alone, and unknown text unchanged", () => {
    expect(translateMessage("Not enough stock", "en")).toBe("Not enough stock");
    expect(translateMessage("Some brand new message", "hi")).toBe("Some brand new message");
  });
});

describe("report text", () => {
  it("translates titles, columns, notes, totals and subtitles but leaves numbers alone", () => {
    const r = localizeReport(
      {
        name: "stock",
        title: "Stock on hand",
        subtitle: "All stores, as of 2026-11-27",
        columns: [{ key: "item", label: "Item", kind: "text" }, { key: "usableQty", label: "Usable quantity", kind: "int" }],
        rows: [{ item: "Paracetamol 500 mg", usableQty: 1234 }],
        totals: { item: "Total", usableQty: 1234 },
        notes: ["Items with no consumption in the period are not listed."],
      },
      "hi",
    );
    expect(r.title).toBe("मौजूदा स्टॉक");
    expect(r.subtitle).toContain("2026-11-27");
    expect(r.subtitle).toContain("सभी स्टोर");
    expect(r.columns.map((c) => c.label)).toEqual(["दवा / सामान", "इस्तेमाल लायक मात्रा"]);
    expect(r.rows[0]).toEqual({ item: "Paracetamol 500 mg", usableQty: 1234 });
    expect(r.totals?.item).toBe("कुल");
    expect(r.notes?.[0]).toContain("सूची");
  });

  it("translates expiry band names in cells", () => {
    const base = { name: "expiry", title: "x", subtitle: "x", columns: [{ key: "band", label: "Band", kind: "text" as const }], rows: [{ band: "Within 30 days" }, { band: "31 to 60 days" }, { band: "Expired" }] };
    expect(localizeReport(base, "hi").rows.map((r) => r.band)).toEqual(["30 दिन के अंदर", "31 से 60 दिन", "एक्सपायर हो चुकी"]);
  });
});
