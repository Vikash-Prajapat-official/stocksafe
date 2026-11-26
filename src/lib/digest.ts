// The daily email digest. Pure: takes numbers, returns subject + text + HTML.

import { formatPaise } from "@/lib/money";

export type DigestInput = {
  hospitalName: string;
  /** YYYY-MM-DD */
  date: string;
  /** Base address of the app for links, e.g. http://192.168.1.10:3002 (empty = no links). */
  appUrl: string;
  expired: { count: number; valuePaise: number };
  bands: { label: string; count: number; valuePaise: number }[];
  lowStock: {
    total: number;
    out: number;
    top: { name: string; strength: string | null; unit: string; onHand: number; suggested: number; status: "LOW" | "OUT" }[];
  };
  pendingIndents: number;
  openCounts: number;
};

export type Digest = { subject: string; text: string; html: string; hasAlerts: boolean };

const TOP = 15;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const itemName = (i: { name: string; strength: string | null }) => (i.strength ? `${i.name} ${i.strength}` : i.name);

export function buildDigest(d: DigestInput): Digest {
  const alerts = d.expired.count + d.bands.reduce((s, b) => s + b.count, 0) + d.lowStock.total;
  const hasAlerts = alerts > 0;
  const subject = `${hasAlerts ? "[Action needed] " : ""}StockSafe daily digest: ${d.hospitalName}, ${d.date}`;
  const base = d.appUrl.replace(/\/+$/, "");
  const links: [string, string][] = base
    ? [
        ["Expiry centre", `${base}/expiry`],
        ["Reorder list", `${base}/reorder`],
        ["Indents", `${base}/indents`],
        ["Dashboard", `${base}/dashboard`],
      ]
    : [];

  const expiryLines = [
    `Expired stock: ${plural(d.expired.count, "batch", "batches")}, value ${formatPaise(d.expired.valuePaise)}`,
    ...d.bands.map((b) => `${b.label}: ${plural(b.count, "batch", "batches")}, value ${formatPaise(b.valuePaise)}`),
  ];
  const shown = d.lowStock.top.slice(0, TOP);
  const more = d.lowStock.total - shown.length;
  const lowLines = shown.map(
    (i) => `${itemName(i)}: ${i.onHand} ${i.unit} on hand, suggested order ${i.suggested}${i.status === "OUT" ? " (OUT OF STOCK)" : ""}`,
  );
  const workLines = [`Indents waiting for the store: ${d.pendingIndents}`, `Stock counts in progress: ${d.openCounts}`];

  const text = [
    `StockSafe daily digest`,
    `${d.hospitalName}, ${d.date}`,
    ``,
    hasAlerts ? `` : `Nothing needs attention today.`,
    `EXPIRY`,
    ...expiryLines.map((l) => `- ${l}`),
    ``,
    `LOW STOCK`,
    d.lowStock.total === 0
      ? `- No items are below their reorder level.`
      : `- ${plural(d.lowStock.total, "item is", "items are")} below the reorder level (${d.lowStock.out} out of stock).`,
    ...lowLines.map((l) => `  * ${l}`),
    ...(more > 0 ? [`  * and ${more} more`] : []),
    ``,
    `WORK WAITING`,
    ...workLines.map((l) => `- ${l}`),
    ...(links.length ? [``, ...links.map(([label, url]) => `${label}: ${url}`)] : []),
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");

  const li = (s: string) => `<li>${escapeHtml(s)}</li>`;
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#171717;max-width:640px">
<h2 style="color:#15803d;margin-bottom:0">StockSafe daily digest</h2>
<p style="margin-top:4px;color:#525252">${escapeHtml(d.hospitalName)}, ${escapeHtml(d.date)}</p>
${hasAlerts ? "" : "<p><strong>Nothing needs attention today.</strong></p>"}
<h3>Expiry</h3>
<ul>${expiryLines.map(li).join("")}</ul>
<h3>Low stock</h3>
${
  d.lowStock.total === 0
    ? "<p>No items are below their reorder level.</p>"
    : `<p>${escapeHtml(plural(d.lowStock.total, "item is", "items are"))} below the reorder level (${d.lowStock.out} out of stock).</p>
<ul>${lowLines.map(li).join("")}${more > 0 ? li(`and ${more} more`) : ""}</ul>`
}
<h3>Work waiting</h3>
<ul>${workLines.map(li).join("")}</ul>
${links.length ? `<p>${links.map(([label, url]) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`).join(" &middot; ")}</p>` : ""}
</body></html>`;

  return { subject, text, html, hasAlerts };
}
