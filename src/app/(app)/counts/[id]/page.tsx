import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { dateTimeFormat } from "@/i18n/labels";
import { intlTag, type Locale } from "@/i18n/locale";
import { CountDecision } from "@/components/count-actions";
import { CountSheet } from "@/components/count-sheet";
import { Badge } from "@/components/ui/fields";
import { ApiError } from "@/lib/api-error";
import { getCount } from "@/lib/counts";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const signed = (p: number) => (p < 0 ? `−${formatPaise(-p)}` : p > 0 ? `+${formatPaise(p)}` : formatPaise(0));
const signedUnits = (n: number) => (n < 0 ? `−${-n}` : n > 0 ? `+${n}` : "0");

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(["STOREKEEPER", "ADMIN", "AUDITOR"]);
  const t = await getTranslations("counts");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const { id } = await params;
  const c = await getCount(id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  if (user.role === "STOREKEEPER") {
    const link = await db.userStore.findUnique({ where: { userId_storeId: { userId: user.id, storeId: c.storeId } } });
    if (!link) redirect("/counts");
  }
  const fmt = dateTimeFormat(intlTag(locale));
  const canCount = c.status === "OPEN" && user.role !== "AUDITOR";
  const counted = c.lines.filter((l) => l.countedQty !== null);
  const byImpact = [...counted].sort((a, b) => Math.abs(b.variance.valuePaise) - Math.abs(a.variance.valuePaise) || a.itemName.localeCompare(b.itemName));
  const moved = counted.filter((l) => l.movedSince).length;
  const s = c.summary;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/counts" className="text-sm text-primary hover:underline">← {t("all")}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{t("heading", { seq: c.seq, store: c.storeName })}</h1>
          <Badge tone={c.status === "APPROVED" ? "green" : "neutral"}>{t(`status.${c.status}`)}</Badge>
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          {t("startedLine", { by: c.startedByName })} <span className="tabular-nums">{fmt.format(c.createdAt)}</span>
          {c.approvedByName ? <> · {t("approvedLine", { by: c.approvedByName })} <span className="tabular-nums">{c.approvedAt ? fmt.format(c.approvedAt) : ""}</span></> : null}
        </p>
      </div>

      {canCount ? (
        <CountSheet
          countId={c.id}
          lines={c.lines.map((l) => ({ id: l.id, itemName: l.itemName, strength: l.strength, unit: l.unit, batchNo: l.batchNo, expiryDate: l.expiryDate, systemQty: l.systemQty, countedQty: l.countedQty }))}
        />
      ) : (
        <>
          {c.status === "OPEN" ? <p className="rounded-md border bg-neutral-50 px-3 py-2 text-sm">{t("inProgress", { done: counted.length, total: c.lines.length })}</p> : null}

          <section aria-label={t("varianceSummary")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4"><div className="text-sm text-neutral-600">{t("counted")}</div><div className="text-2xl font-semibold tabular-nums">{s.counted} <span className="text-base font-normal text-neutral-500">{t("ofTotal", { total: s.total })}</span></div></div>
            <div className="rounded-lg border p-4"><div className="text-sm text-neutral-600">{t("short")}</div><div className="text-2xl font-semibold tabular-nums">{formatPaise(s.lossPaise)}</div><div className="text-xs text-neutral-500">{tc("batches", { count: s.short })}</div></div>
            <div className="rounded-lg border p-4"><div className="text-sm text-neutral-600">{t("over")}</div><div className="text-2xl font-semibold tabular-nums">{formatPaise(s.gainPaise)}</div><div className="text-xs text-neutral-500">{tc("batches", { count: s.over })}</div></div>
            <div className="rounded-lg border p-4"><div className="text-sm text-neutral-600">{t("net")}</div><div className="text-2xl font-semibold tabular-nums">{signed(s.netPaise)}</div><div className="text-xs text-neutral-500">{t("netSub", { units: signedUnits(s.netUnits), matched: s.matching })}</div></div>
          </section>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">{tc("item")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{tc("batch")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("system")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("counted")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t("difference")}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{tc("value")}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{tc("note")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byImpact.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">{t("noneCounted")}</td></tr>
                ) : (
                  byImpact.map((l) => (
                    <tr key={l.id} className={l.variance.units === 0 ? "text-neutral-500" : undefined}>
                      <td className="px-3 py-2">{l.strength ? `${l.itemName} ${l.strength}` : l.itemName}</td>
                      <td className="px-3 py-2">{l.batchNo} <span className="tabular-nums text-neutral-500">({l.expiryDate})</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.systemQty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.countedQty}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{signedUnits(l.variance.units)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{signed(l.variance.valuePaise)}</td>
                      <td className="px-3 py-2 text-xs">{l.movedSince && c.status !== "APPROVED" ? t("moved", { qty: l.currentQty }) : ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {s.uncounted > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-neutral-700">{t("uncounted", { count: s.uncounted })}</summary>
              <ul className="mt-2 list-inside list-disc text-neutral-600">
                {c.lines.filter((l) => l.countedQty === null).map((l) => <li key={l.id}>{t("uncountedLine", { item: l.itemName, batch: l.batchNo, qty: l.systemQty })}</li>)}
              </ul>
            </details>
          ) : null}

          {c.status === "SUBMITTED" && moved > 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              {t("movedWarning", { count: moved })}
            </p>
          ) : null}

          {c.status === "SUBMITTED" && user.role === "ADMIN" ? <CountDecision id={c.id} netUnits={s.netUnits} lossText={t("atCost", { amount: signed(s.netPaise) })} /> : null}
          {c.status === "SUBMITTED" && user.role !== "ADMIN" ? <p className="text-sm text-neutral-600">{t("waitingAdmin")}</p> : null}
        </>
      )}
    </div>
  );
}
