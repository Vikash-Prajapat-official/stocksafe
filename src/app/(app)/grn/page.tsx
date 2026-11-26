import { getLocale, getTranslations } from "next-intl/server";
import { GrnForm } from "@/components/grn-form";
import { dateTimeFormat } from "@/i18n/labels";
import { intlTag, type Locale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/fefo";
import { formatPaise } from "@/lib/money";
import { requirePageUser } from "@/lib/session";
import { userStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("grn"))("title") };
}

export default async function GrnPage() {
  const user = await requirePageUser(["STOREKEEPER"]);
  const t = await getTranslations("grn");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const [stores, suppliers, recent] = await Promise.all([
    userStores(user),
    db.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.grn.findMany({
      orderBy: { receivedAt: "desc" },
      take: 15,
      include: { supplier: { select: { name: true } }, receiver: { select: { name: true } } },
    }),
  ]);
  const fmt = dateTimeFormat(intlTag(locale));

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t("heading")}</h1>
        <p className="text-sm text-neutral-600">{t("intro")}</p>
      </div>
      {stores.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">{t("noStore")}</p>
      ) : suppliers.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">{t("noSupplier")}</p>
      ) : (
        <GrnForm stores={stores} suppliers={suppliers} today={todayIST()} />
      )}

      <section className="space-y-2">
        <h2 className="font-medium">{t("recent")}</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{t("receivedCol")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("supplier")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("invoice")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{tc("total")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{tc("by")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recent.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-neutral-500">{t("none")}</td></tr>
              ) : (
                recent.map((g) => (
                  <tr key={g.id}>
                    <td className="px-3 py-2 tabular-nums">{fmt.format(g.receivedAt)}</td>
                    <td className="px-3 py-2">{g.supplier.name}</td>
                    <td className="px-3 py-2">{g.invoiceNo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPaise(g.totalPaise)}</td>
                    <td className="px-3 py-2">{g.receiver.name}</td>
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
