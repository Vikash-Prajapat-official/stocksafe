import Link from "next/link";
import { getDashboard } from "@/lib/dashboard";
import { MOVEMENT_LABELS } from "@/lib/ledger";
import { formatPaise } from "@/lib/money";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · StockSafe" };

function Card({ href, title, value, sub, tone }: { href: string; title: string; value: string; sub?: string; tone?: "red" | "amber" }) {
  const ring = tone === "red" ? "border-red-200 bg-red-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : "bg-white";
  const text = tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-800" : "text-neutral-900";
  return (
    <Link href={href} className={`block rounded-lg border p-4 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-primary ${ring}`}>
      <div className="text-sm text-neutral-600">{title}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${text}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-neutral-600 tabular-nums">{sub}</div> : null}
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requirePageUser();
  const d = await getDashboard();
  const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  const sees = (...roles: string[]) => roles.includes(user.role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-neutral-600">Whole hospital, as of today ({d.today}). Click a card for the detail.</p>
      </div>

      <section aria-label="Expiry" className="space-y-3">
        <h2 className="font-medium">Expiry</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            href="/expiry?tab=expired"
            title="Expired stock (value at cost)"
            value={formatPaise(d.expired.valuePaise)}
            sub={`${d.expired.count} batch${d.expired.count === 1 ? "" : "es"}`}
            tone={d.expired.count > 0 ? "red" : undefined}
          />
          {d.bands.map((b) => (
            <Card key={b.key} href={`/expiry?tab=${b.key}`} title={b.label} value={formatPaise(b.valuePaise)} sub={`${b.count} batch${b.count === 1 ? "" : "es"}`} tone={b.count > 0 ? "amber" : undefined} />
          ))}
        </div>
      </section>

      <section aria-label="Stock levels and work" className="space-y-3">
        <h2 className="font-medium">Stock and work in progress</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card href="/reorder" title="Items below reorder level" value={String(d.lowStockCount)} sub="Click for the reorder list" />
          <Card href="/reorder?filter=out" title="Out of stock today" value={String(d.outCount)} sub="Items with a reorder level and nothing usable" />
          {sees("NURSE", "STOREKEEPER", "ADMIN", "AUDITOR") ? (
            <Card href="/indents?status=SUBMITTED" title="Indents waiting for the store" value={String(d.pendingIndents)} />
          ) : null}
          {sees("STOREKEEPER", "ADMIN", "AUDITOR") ? <Card href="/counts" title="Stock counts in progress" value={String(d.openCounts)} /> : null}
        </div>
      </section>

      <section aria-label="Recent movements" className="space-y-2">
        <h2 className="font-medium">Recent movements</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">When</th>
                <th scope="col" className="px-3 py-2 font-medium">What</th>
                <th scope="col" className="px-3 py-2 font-medium">Item</th>
                <th scope="col" className="px-3 py-2 font-medium">Store</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Quantity</th>
                <th scope="col" className="px-3 py-2 font-medium">By</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {d.recent.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">No stock movements yet. Receive stock to get started.</td></tr>
              ) : (
                d.recent.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 tabular-nums">{fmt.format(m.at)}</td>
                    <td className="px-3 py-2">{MOVEMENT_LABELS[m.type] ?? m.type}</td>
                    <td className="px-3 py-2">{m.itemName} <span className="text-neutral-500">· {m.batchNo}</span></td>
                    <td className="px-3 py-2">{m.storeName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="px-3 py-2">{m.actorName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
