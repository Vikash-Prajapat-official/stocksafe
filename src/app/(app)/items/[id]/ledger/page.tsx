import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { dateTimeFormat } from "@/i18n/labels";
import { intlTag, type Locale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { getLedger } from "@/lib/ledger";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
const PAGE = 100;

export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ store?: string; batch?: string; page?: string }>;
}) {
  await requirePageUser();
  const t = await getTranslations("ledger");
  const tc = await getTranslations("common");
  const tm = await getTranslations("movements");
  const locale = (await getLocale()) as Locale;
  const { id } = await params;
  const sp = await searchParams;
  const item = await db.item.findUnique({ where: { id }, select: { id: true, name: true, strength: true, unit: true } });
  if (!item) notFound();

  const page = Math.max(1, Number(sp.page) || 1);
  const [stores, batches, ledger] = await Promise.all([
    db.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.batch.findMany({ where: { itemId: id }, orderBy: { expiryDate: "asc" }, select: { id: true, batchNo: true } }),
    getLedger({ itemId: id, storeId: sp.store || undefined, batchId: sp.batch || undefined, limit: PAGE, offset: (page - 1) * PAGE, order: "desc" }),
  ]);
  const pages = Math.max(1, Math.ceil(ledger.total / PAGE));
  const fmt = dateTimeFormat(intlTag(locale));
  const link = (p: number) => {
    const u = new URLSearchParams();
    if (sp.store) u.set("store", sp.store);
    if (sp.batch) u.set("batch", sp.batch);
    if (p > 1) u.set("page", String(p));
    return `/items/${id}/ledger${u.size ? `?${u}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/items/${id}`} className="text-sm text-primary hover:underline">← {item.name}</Link>
        <h1 className="text-xl font-semibold">{t("title", { item: item.strength ? `${item.name} ${item.strength}` : item.name })}</h1>
        <p className="text-sm text-neutral-600">
          {t("intro", { unit: item.unit })}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action={`/items/${id}/ledger`}>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{tc("store")}</span>
          <select name="store" defaultValue={sp.store ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="">{t("allStores")}</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{tc("batch")}</span>
          <select name="batch" defaultValue={sp.batch ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="">{t("allBatches")}</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.batchNo}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">{t("show")}</button>
      </form>

      <p className="text-sm text-neutral-600 tabular-nums">{t("count", { count: ledger.total })}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{tc("when")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("type")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("store")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("batchExpiry")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("in")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("out")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("balance")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("note")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("by")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ledger.rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-neutral-500">{t("none")}</td></tr>
            ) : (
              ledger.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 tabular-nums">{fmt.format(r.at)}</td>
                  <td className="px-3 py-2">{tm.has(r.type) ? tm(r.type) : r.type}</td>
                  <td className="px-3 py-2">{r.storeName}</td>
                  <td className="px-3 py-2">{r.batchNo} <span className="tabular-nums text-neutral-500">({r.expiryDate})</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.quantity > 0 ? r.quantity : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.quantity < 0 ? -r.quantity : ""}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{r.balanceAfter}</td>
                  <td className="px-3 py-2">{[r.patientLabel, r.reason].filter(Boolean).join(" · ")}</td>
                  <td className="px-3 py-2">{r.actorName}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav aria-label={t("pagination")} className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={link(page - 1)} className="text-primary hover:underline">← {t("newer")}</Link> : <span />}
          <span className="tabular-nums text-neutral-600">{t("pageOf", { page, pages })}</span>
          {page < pages ? <Link href={link(page + 1)} className="text-primary hover:underline">{t("older")} →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
