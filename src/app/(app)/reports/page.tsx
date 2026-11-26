import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { ButtonLink } from "@/components/ui/button";
import { db } from "@/lib/db";
import { displayCell } from "@/lib/report-format";
import { REPORT_NAMES, buildReport, isReportName, type ReportName } from "@/lib/reports";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("reports"))("title") };
}

const SCREEN_ROWS = 300;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ name?: string; store?: string; months?: string; days?: string }> }) {
  await requirePageUser(["ADMIN", "AUDITOR"]);
  const t = await getTranslations("reports");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const sp = await searchParams;
  const name: ReportName = sp.name && isReportName(sp.name) ? sp.name : "stock";
  const stores = await db.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const months = /^\d{1,2}$/.test(sp.months ?? "") ? Number(sp.months) : undefined;
  const days = /^\d{1,3}$/.test(sp.days ?? "") ? Number(sp.days) : undefined;

  let report = null;
  let error: string | null = null;
  try {
    report = await buildReport(name, { storeId: sp.store || undefined, months, days, locale });
  } catch (e) {
    if (e instanceof RangeError) error = e.message;
    else throw e;
  }

  const q = new URLSearchParams();
  if (sp.store) q.set("store", sp.store);
  if (months !== undefined) q.set("months", String(months));
  if (days !== undefined) q.set("days", String(days));
  const qs = q.toString();
  const download = (format: string) => `/api/reports/${name}?format=${format}${qs ? `&${qs}` : ""}`;
  const usesMonths = name === "consumption" || name === "abc";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-neutral-600">{t("intro")}</p>
      </div>

      <nav aria-label={t("title")} className="flex flex-wrap gap-2">
        {REPORT_NAMES.map((n) => (
          <Link key={n} href={`/reports?name=${n}${sp.store ? `&store=${sp.store}` : ""}`} aria-current={n === name ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-sm ${n === name ? "border-primary bg-green-50" : "hover:bg-neutral-50"}`}>
            {t(`names.${n}`)}
          </Link>
        ))}
      </nav>

      <form action="/reports" className="flex flex-wrap items-end gap-3" role="search">
        <input type="hidden" name="name" value={name} />
        <label className="text-sm">
          <span className="mb-1 block font-medium">{tc("store")}</span>
          <select name="store" defaultValue={sp.store ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="">{t("allStores")}</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {usesMonths ? (
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t("monthsBack")}</span>
            <input name="months" type="number" min={1} max={24} defaultValue={months ?? (name === "abc" ? 12 : 6)} className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm tabular-nums" />
          </label>
        ) : null}
        {name === "stockout" ? (
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t("daysBack")}</span>
            <input name="days" type="number" min={1} max={366} defaultValue={days ?? 90} className="w-24 rounded-md border border-neutral-300 px-3 py-2 text-sm tabular-nums" />
          </label>
        ) : null}
        <button type="submit" className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50">{t("show")}</button>
        {report ? (
          <div className="ml-auto flex gap-2">
            <ButtonLink href={download("csv")} variant="outline" prefetch={false}>{t("csv")}</ButtonLink>
            <ButtonLink href={download("pdf")} variant="outline" prefetch={false}>{t("pdf")}</ButtonLink>
          </div>
        ) : null}
      </form>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {report ? (
        <section aria-label={report.title} className="space-y-2">
          <div>
            <h2 className="font-medium">{report.title}</h2>
            <p className="text-sm text-neutral-600">{report.subtitle}</p>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  {report.columns.map((c) => (
                    <th key={c.key} scope="col" className={`px-3 py-2 font-medium ${c.kind === "text" || c.kind === "date" ? "" : "text-right"}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.rows.length === 0 ? (
                  <tr><td colSpan={report.columns.length} className="px-3 py-8 text-center text-neutral-500">{t("nothing")}</td></tr>
                ) : (
                  report.rows.slice(0, SCREEN_ROWS).map((row, i) => (
                    <tr key={i}>
                      {report.columns.map((c) => (
                        <td key={c.key} className={`px-3 py-2 ${c.kind === "text" || c.kind === "date" ? "" : "text-right tabular-nums"}`}>{displayCell(c, row[c.key])}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
              {report.totals ? (
                <tfoot className="bg-neutral-50 font-medium">
                  <tr>
                    {report.columns.map((c) => (
                      <td key={c.key} className={`px-3 py-2 ${c.kind === "text" || c.kind === "date" ? "" : "text-right tabular-nums"}`}>{displayCell(c, report.totals?.[c.key])}</td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          {report.rows.length > SCREEN_ROWS ? <p className="text-sm text-neutral-600">{t("truncated", { shown: SCREEN_ROWS, total: report.rows.length })}</p> : null}
          {(report.notes ?? []).map((n) => <p key={n} className="text-xs text-neutral-500">{n}</p>)}
        </section>
      ) : null}
    </div>
  );
}
