import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getDashboard } from "@/lib/dashboard";
import { bandLabel, dateTimeFormat, type T } from "@/i18n/labels";
import { intlTag, type Locale } from "@/i18n/locale";
import { formatPaise } from "@/lib/money";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("dashboard"))("title") };
}

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
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const tm = await getTranslations("movements");
  const tb = (await getTranslations("bands")) as unknown as T;
  const locale = (await getLocale()) as Locale;
  const fmt = dateTimeFormat(intlTag(locale));
  const sees = (...roles: string[]) => roles.includes(user.role);
  const batches = (n: number) => tc("batches", { count: n });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-neutral-600">{t("subtitle", { date: d.today })}</p>
      </div>

      <section aria-label={t("expiry")} className="space-y-3">
        <h2 className="font-medium">{t("expiry")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            href="/expiry?tab=expired"
            title={t("expiredStock")}
            value={formatPaise(d.expired.valuePaise)}
            sub={batches(d.expired.count)}
            tone={d.expired.count > 0 ? "red" : undefined}
          />
          {d.bands.map((b) => (
            <Card key={b.key} href={`/expiry?tab=${b.key}`} title={bandLabel(tb, b)} value={formatPaise(b.valuePaise)} sub={batches(b.count)} tone={b.count > 0 ? "amber" : undefined} />
          ))}
        </div>
      </section>

      <section aria-label={t("stockAndWork")} className="space-y-3">
        <h2 className="font-medium">{t("stockAndWork")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card href="/reorder" title={t("belowReorder")} value={String(d.lowStockCount)} sub={t("belowReorderSub")} />
          <Card href="/reorder?filter=out" title={t("outToday")} value={String(d.outCount)} sub={t("outTodaySub")} />
          {sees("NURSE", "STOREKEEPER", "ADMIN", "AUDITOR") ? (
            <Card href="/indents?status=SUBMITTED" title={t("pendingIndents")} value={String(d.pendingIndents)} />
          ) : null}
          {sees("STOREKEEPER", "ADMIN", "AUDITOR") ? <Card href="/counts" title={t("openCounts")} value={String(d.openCounts)} /> : null}
        </div>
      </section>

      <section aria-label={t("recent")} className="space-y-2">
        <h2 className="font-medium">{t("recent")}</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{tc("when")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("what")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{tc("item")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{tc("store")}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{tc("quantity")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{tc("by")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {d.recent.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">{t("noMovements")}</td></tr>
              ) : (
                d.recent.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2 tabular-nums">{fmt.format(m.at)}</td>
                    <td className="px-3 py-2">{tm.has(m.type) ? tm(m.type) : m.type}</td>
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
