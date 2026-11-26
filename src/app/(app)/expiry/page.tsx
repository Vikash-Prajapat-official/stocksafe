import Link from "next/link";
import { ExpiryActions } from "@/components/expiry-actions";
import { Badge } from "@/components/ui/fields";
import { getExpiryList } from "@/lib/alerts";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import { requirePageUser } from "@/lib/session";
import { allActiveStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expiry centre · StockSafe" };

export default async function ExpiryPage({ searchParams }: { searchParams: Promise<{ tab?: string; store?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const [data, stores, mine] = await Promise.all([
    getExpiryList({ storeId: sp.store || undefined }),
    allActiveStores(),
    user.role === "ADMIN" ? Promise.resolve([]) : db.userStore.findMany({ where: { userId: user.id }, select: { storeId: true } }),
  ]);
  const myStoreIds = new Set(mine.map((m) => m.storeId));
  const tab = data.bands.some((b) => b.key === sp.tab) || sp.tab === "all" ? sp.tab! : "expired";
  const rows = tab === "all" ? data.rows : data.rows.filter((r) => r.band === tab);
  const summary = new Map(data.summary.map((s) => [s.key, s]));
  const total = rows.reduce((s, r) => s + r.valuePaise, 0);
  const href = (t: string) => `/expiry?tab=${t}${sp.store ? `&store=${sp.store}` : ""}`;
  const canTransferRole = user.role === "STOREKEEPER" || user.role === "PHARMACIST";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Expiry centre</h1>
        <p className="text-sm text-neutral-600">
          Expired and soon-to-expire stock with its value at cost. Expired batches are never issued or dispensed. As of {data.today}.
        </p>
      </div>

      <nav aria-label="Expiry bands" className="flex flex-wrap gap-2">
        {data.bands.map((b) => {
          const s = summary.get(b.key);
          const active = tab === b.key;
          return (
            <Link
              key={b.key}
              href={href(b.key)}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg border px-3 py-2 text-sm ${active ? "border-primary bg-green-50" : "hover:bg-neutral-50"}`}
            >
              <span className="font-medium">{b.label}</span>
              <span className={`ml-2 tabular-nums ${b.key === "expired" && s?.count ? "text-red-700" : s?.count ? "text-amber-800" : "text-neutral-500"}`}>
                {s?.count ?? 0} · {formatPaise(s?.valuePaise ?? 0)}
              </span>
            </Link>
          );
        })}
        <Link href={href("all")} aria-current={tab === "all" ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-sm ${tab === "all" ? "border-primary bg-green-50" : "hover:bg-neutral-50"}`}>
          All
        </Link>
      </nav>

      <form action="/expiry" className="flex items-end gap-3" role="search">
        <input type="hidden" name="tab" value={tab} />
        <label className="text-sm">
          <span className="mb-1 block font-medium">Store</span>
          <select name="store" defaultValue={sp.store ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="">All stores</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">Show</button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Item</th>
              <th scope="col" className="px-3 py-2 font-medium">Store</th>
              <th scope="col" className="px-3 py-2 font-medium">Batch</th>
              <th scope="col" className="px-3 py-2 font-medium">Expiry</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Quantity</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
              <th scope="col" className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y align-top">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">Nothing here. </td></tr>
            ) : (
              rows.map((r) => {
                const expired = r.daysLeft < 0;
                return (
                  <tr key={`${r.storeId}-${r.batchId}`}>
                    <td className="px-3 py-2 font-medium">{r.strength ? `${r.itemName} ${r.strength}` : r.itemName}</td>
                    <td className="px-3 py-2">{r.storeName}</td>
                    <td className="px-3 py-2">{r.batchNo}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.expiryDate}{" "}
                      {expired ? <Badge tone="red">Expired {-r.daysLeft} day{r.daysLeft === -1 ? "" : "s"} ago</Badge> : <Badge tone="amber">{r.daysLeft === 0 ? "Today" : `${r.daysLeft} days`}</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.quantity} {r.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPaise(r.valuePaise)}</td>
                    <td className="px-3 py-2">
                      <ExpiryActions
                        row={{ storeId: r.storeId, itemId: r.itemId, batchId: r.batchId, itemName: r.itemName, batchNo: r.batchNo, quantity: r.quantity, unit: r.unit, expired }}
                        isAdmin={user.role === "ADMIN"}
                        canTransfer={canTransferRole && myStoreIds.has(r.storeId)}
                        stores={stores}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length ? (
            <tfoot className="bg-neutral-50 font-medium">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-right">Total value shown</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPaise(total)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {data.truncated ? <p className="text-sm text-amber-800">Showing the first 2,000 batches only. Pick a store to narrow the list.</p> : null}
      <p className="text-xs text-neutral-500">
        Write off and return to supplier are done by an admin, who is recorded as the approver. Store keepers and pharmacists can move near-expiry stock to another store (for example to the pharmacy, where it sells faster).
      </p>
    </div>
  );
}
