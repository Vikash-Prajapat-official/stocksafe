import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { dateTimeFormat } from "@/i18n/labels";
import { intlTag, type Locale } from "@/i18n/locale";
import { StartCountForm } from "@/components/count-actions";
import { Badge } from "@/components/ui/fields";
import { listCounts } from "@/lib/counts";
import { requirePageUser } from "@/lib/session";
import { userStores } from "@/lib/store-access";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("counts"))("title") };
}

export default async function CountsPage() {
  const user = await requirePageUser(["STOREKEEPER", "ADMIN", "AUDITOR"]);
  const t = await getTranslations("counts");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const [counts, stores] = await Promise.all([listCounts(user), user.role === "AUDITOR" ? Promise.resolve([]) : userStores(user)]);
  const fmt = dateTimeFormat(intlTag(locale));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-neutral-600">{t("intro")}</p>
      </div>
      {stores.length > 0 ? <StartCountForm stores={stores} /> : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{t("no")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("store")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{tc("status")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t("batches")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("startedBy")}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t("started")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {counts.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-neutral-500">{t("none")}</td></tr>
            ) : (
              counts.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-medium tabular-nums"><Link href={`/counts/${c.id}`} className="text-primary hover:underline">#{c.seq}</Link></td>
                  <td className="px-3 py-2">{c.store.name}</td>
                  <td className="px-3 py-2"><Badge tone={c.status === "APPROVED" ? "green" : "neutral"}>{t(`status.${c.status}`)}</Badge></td>
                  <td className="px-3 py-2 text-right tabular-nums">{c._count.lines}</td>
                  <td className="px-3 py-2">{c.starter.name}</td>
                  <td className="px-3 py-2 tabular-nums">{fmt.format(c.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
