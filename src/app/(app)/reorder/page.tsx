import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/print-button";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/fields";
import { getLowStock } from "@/lib/alerts";
import { todayIST } from "@/lib/fefo";
import { requirePageUser } from "@/lib/session";
import { allActiveStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("reorder"))("title") };
}

export default async function ReorderPage({ searchParams }: { searchParams: Promise<{ store?: string; filter?: string }> }) {
  await requirePageUser();
  const t = await getTranslations("reorder");
  const tc = await getTranslations("common");
  const sp = await searchParams;
  const [all, stores] = await Promise.all([getLowStock({ storeId: sp.store || undefined }), allActiveStores()]);
  const filter = sp.filter === "out" || sp.filter === "low" ? sp.filter : "all";
  const rows = filter === "out" ? all.filter((r) => r.status === "OUT") : filter === "low" ? all.filter((r) => r.status === "LOW") : all;
  const storeName = stores.find((s) => s.id === sp.store)?.name ?? t("allStores");
  const href = (f: string) => `/reorder?filter=${f}${sp.store ? `&store=${sp.store}` : ""}`;
  const csv = `/api/alerts/low-stock?format=csv${sp.store ? `&store=${sp.store}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-neutral-600">
            {t("intro", { store: storeName, date: todayIST() })}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <ButtonLink href={csv} variant="outline" prefetch={false}>{t("csv")}</ButtonLink>
          <PrintButton label={t("print")} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <nav aria-label={t("filter")} className="flex gap-2">
          {[["all", t("fAll", { n: all.length })], ["out", t("fOut", { n: all.filter((r) => r.status === "OUT").length })], ["low", t("fLow", { n: all.filter((r) => r.status === "LOW").length })]].map(([k, label]) => (
            <Link key={k} href={href(k!)} aria-current={filter === k ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-sm ${filter === k ? "border-primary bg-green-50" : "hover:bg-neutral-50"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <form action="/reorder" className="flex items-end gap-2" role="search">
          <input type="hidden" name="filter" value={filter} />
          <label className="text-sm">
            <span className="mb-1 block font-medium">{tc("store")}</span>
            <select name="store" defaultValue={sp.store ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="">{t("allStores")}</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">{t("show")}</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{tc("item")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("status")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("onHand")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("min")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("reorder")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("max")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("suggested")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                {t("nothing")}
              </td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.itemId}>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/items/${r.itemId}`} className="hover:underline">{r.strength ? `${r.name} ${r.strength}` : r.name}</Link>
                    {r.expiredQty > 0 ? <div className="text-xs font-normal text-neutral-500">{t("expiredNotCounted", { n: r.expiredQty })}</div> : null}
                  </td>
                  <td className="px-3 py-2">{r.status === "OUT" ? <Badge tone="neutral">{t("out")}</Badge> : <Badge tone="neutral">{t("low")}</Badge>}{r.belowMin ? <span className="ml-1"><Badge tone="neutral">{t("belowMin")}</Badge></span> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.onHand} <span className="text-neutral-500">{r.unit}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.minLevel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.reorderLevel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.maxLevel || <span className="text-neutral-400" title={t("autoTip")}>{t("auto")}</span>}</td>
                  <td className="px-3 py-2 text-right text-base font-semibold tabular-nums">{r.suggested}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
