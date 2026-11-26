import { describe, expect, it } from "vitest";
import { buildDigest, type DigestInput } from "@/lib/digest";

const base: DigestInput = {
  hospitalName: "City Hospital",
  date: "2026-11-27",
  appUrl: "http://192.168.1.10:3002/",
  expired: { count: 2, valuePaise: 123450 },
  bands: [
    { label: "Within 30 days", count: 3, valuePaise: 50000 },
    { label: "31 to 60 days", count: 0, valuePaise: 0 },
    { label: "61 to 90 days", count: 1, valuePaise: 1000 },
  ],
  lowStock: {
    total: 2,
    out: 1,
    top: [
      { name: "Paracetamol", strength: "500 mg", unit: "tablet", onHand: 0, suggested: 6000, status: "OUT" },
      { name: "Insulin Regular", strength: "40 IU/ml", unit: "vial", onHand: 12, suggested: 88, status: "LOW" },
    ],
  },
  pendingIndents: 4,
  openCounts: 1,
};

describe("buildDigest", () => {
  it("flags the subject when something needs action, and names the hospital and date", () => {
    const d = buildDigest(base);
    expect(d.subject).toBe("[Action needed] StockSafe daily digest: City Hospital, 2026-11-27");
    expect(d.hasAlerts).toBe(true);
  });

  it("states the money in rupees with Indian grouping, in both the text and the HTML", () => {
    const d = buildDigest(base);
    for (const body of [d.text, d.html]) {
      expect(body).toContain("₹1,234.50"); // expired value
      expect(body).toContain("₹500.00"); // within 30 days
      expect(body).toContain("Paracetamol 500 mg");
      expect(body).toContain("6000");
    }
    expect(d.text).toContain("2 batches");
    expect(d.text).toContain("Indents waiting for the store: 4");
  });

  it("links to the pages, without a double slash", () => {
    const d = buildDigest(base);
    expect(d.text).toContain("http://192.168.1.10:3002/expiry");
    expect(d.html).toContain('href="http://192.168.1.10:3002/reorder"');
    expect(d.text).not.toContain("3002//");
  });

  it("escapes item names in the HTML so a name cannot inject markup", () => {
    const d = buildDigest({ ...base, lowStock: { total: 1, out: 0, top: [{ name: '<img src=x onerror="alert(1)">', strength: "5 & 10 mg", unit: "tab", onHand: 1, suggested: 9, status: "LOW" }] } });
    expect(d.html).not.toContain("<img");
    expect(d.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(d.html).toContain("5 &amp; 10 mg");
    expect(d.text).toContain('<img src=x onerror="alert(1)">'); // plain text needs no escaping
  });

  it("says so plainly, with no alert flag, when nothing needs attention", () => {
    const d = buildDigest({ ...base, expired: { count: 0, valuePaise: 0 }, bands: base.bands.map((b) => ({ ...b, count: 0, valuePaise: 0 })), lowStock: { total: 0, out: 0, top: [] }, pendingIndents: 0, openCounts: 0 });
    expect(d.hasAlerts).toBe(false);
    expect(d.subject).toBe("StockSafe daily digest: City Hospital, 2026-11-27");
    expect(d.text).toContain("Nothing needs attention today");
  });

  it("lists at most 15 low-stock items and says how many more there are", () => {
    const top = Array.from({ length: 20 }, (_, i) => ({ name: `Item ${i}`, strength: null, unit: "tab", onHand: 1, suggested: 5, status: "LOW" as const }));
    const d = buildDigest({ ...base, lowStock: { total: 20, out: 0, top } });
    expect(d.text).toContain("Item 14");
    expect(d.text).not.toContain("Item 15");
    expect(d.text).toContain("and 5 more");
  });

  it("works without an app URL (no links)", () => {
    const d = buildDigest({ ...base, appUrl: "" });
    expect(d.text).not.toContain("http");
    expect(d.html).not.toContain("href=");
  });
});
