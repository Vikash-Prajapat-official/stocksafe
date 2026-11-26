import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { bandLabel, type T } from "@/i18n/labels";
import { ExpiryActions } from "@/components/expiry-actions";
import { Badge } from "@/components/ui/fields";
import { getExpiryList } from "@/lib/alerts";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import { requirePageUser } from "@/lib/session";
import { allActiveStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("expiry"))("title") };
}

export default async function ExpiryPage({ searchParams }: { searchParams: Promise<{ tab?: string; store?: string }> }) {
  const user = await requirePageUser();
  const t = await getTranslations("expiry");
  const tc = await getTranslations("common");
  const tb = (await getTranslations("bands")) as unknown as T;
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
  const href = (tabKey: string) => `/expiry?tab=${tabKey}${sp.store ? `&store=${sp.store}` : ""}`;
  const canTransferRole = user.role === "STOREKEEPER" || user.role === "PHARMACIST";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-neutral-600">
          {t("intro", { date: data.today })}
        </p>
      </div>

      <nav aria-label={t("bands")} className="flex flex-wrap gap-2">
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
              <span className="font-medium">{bandLabel(tb, b)}</span>
              <span className={`ml-2 tabular-nums ${b.key === "expired" && s?.count ? "text-red-700" : s?.count ? "text-amber-800" : "text-neutral-500"}`}>
                {s?.count ?? 0} · {formatPaise(s?.valuePaise ?? 0)}
              </span>
            </Link>
          );
        })}
        <Link href={href("all")} aria-current={tab === "all" ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-sm ${tab === "all" ? "border-primary bg-green-50" : "hover:bg-neutral-50"}`}>
          {tc("all")}
        </Link>
      </nav>

      <form action="/expiry" className="flex items-end gap-3" role="search">
        <input type="hidden" name="tab" value={tab} />
        <label className="text-sm">
          <span className="mb-1 block font-medium">{tc("store")}</span>
          <select name="store" defaultValue={sp.store ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="">{t("allStores")}</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">{t("show")}</button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{tc("item")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("store")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("batch")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("expiry")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{tc("quantity")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{tc("value")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y align-top">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">{t("nothing")}</td></tr>
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
                      {expired ? <Badge tone="red">{t("expiredAgo", { days: -r.daysLeft })}</Badge> : <Badge tone="amber">{r.daysLeft === 0 ? t("today") : t("inDays", { days: r.daysLeft })}</Badge>}
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
                <td colSpan={5} className="px-3 py-2 text-right">{t("totalShown")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPaise(total)}</td>
                <td />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {data.truncated ? <p className="text-sm text-amber-800">{t("truncated")}</p> : null}
      <p className="text-xs text-neutral-500">
        {t("footer")}
      </p>
    </div>
  );
}
