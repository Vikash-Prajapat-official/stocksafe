import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CountDecision } from "@/components/count-actions";
import { CountSheet } from "@/components/count-sheet";
import { Badge } from "@/components/ui/fields";
import { ApiError } from "@/lib/api-error";
import { getCount } from "@/lib/counts";
import { db } from "@/lib/db";
import { formatPaise } from "@/lib/money";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const LABEL = { OPEN: "Counting", SUBMITTED: "Waiting for approval", APPROVED: "Approved" } as const;
const signed = (p: number) => (p < 0 ? `−${formatPaise(-p)}` : p > 0 ? `+${formatPaise(p)}` : formatPaise(0));
const signedUnits = (n: number) => (n < 0 ? `−${-n}` : n > 0 ? `+${n}` : "0");

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(["STOREKEEPER", "ADMIN", "AUDITOR"]);
  const { id } = await params;
  const c = await getCount(id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  if (user.role === "STOREKEEPER") {
    const link = await db.userStore.findUnique({ where: { userId_storeId: { userId: user.id, storeId: c.storeId } } });
    if (!link) redirect("/counts");
  }
  const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  const canCount = c.status === "OPEN" && user.role !== "AUDITOR";
  const counted = c.lines.filter((l) => l.countedQty !== null);
  const byImpact = [...counted].sort((a, b) => Math.abs(b.variance.valuePaise) - Math.abs(a.variance.valuePaise) || a.itemName.localeCompare(b.itemName));
  const moved = counted.filter((l) => l.movedSince).length;
  const s = c.summary;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/counts" className="text-sm text-primary hover:underline">← All counts</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Count #{c.seq}: {c.storeName}</h1>
          <Badge tone={c.status === "APPROVED" ? "green" : "neutral"}>{LABEL[c.status]}</Badge>
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          Started by {c.startedByName} on <span className="tabular-nums">{fmt.format(c.createdAt)}</span>
          {c.approvedByName ? <> · approved by {c.approvedByName} on <span className="tabular-nums">{c.approvedAt ? fmt.format(c.approvedAt) : ""}</span></> : null}
        </p>
      </div>

      {canCount ? (
        <CountSheet
          countId={c.id}
          lines={c.lines.map((l) => ({ id: l.id, itemName: l.itemName, strength: l.strength, unit: l.unit, batchNo: l.batchNo, expiryDate: l.expiryDate, systemQty: l.systemQty, countedQty: l.countedQty }))}
        />
      ) : (
        <>
          {c.status === "OPEN" ? <p className="rounded-md border bg-neutral-50 px-3 py-2 text-sm">This count is still being done by the store ({counted.length} of {c.lines.length} batches counted so far).</p> : null}

          <section aria-label="Variance summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-4"><div className="text-sm text-neutral-600">Counted</div><div className="text-2xl font-semibold tabular-nums">{s.counted} <span className="text-base font-normal text-neutral-500">of {s.total}</span></div></div>
            <div className="rounded-lg border p-4"><div className="text-sm text-neutral-600">Short (missing stock)</div><div className="text-2xl font-semibold tabular-nums">{formatPaise(s.lossPaise)}</div><div className="text-xs text-neutral-500">{s.short} batch{s.short === 1 ? "" : "es"}</div></div>
            <div className="rounded-lg border p-4"><div className="text-sm text-neutral-600">Over (extra stock)</div><div className="text-2xl font-semibold tabular-nums">{formatPaise(s.gainPaise)}</div><div className="text-xs text-neutral-500">{s.over} batch{s.over === 1 ? "" : "es"}</div></div>
            <div className="rounded-lg border p-4"><div className="text-sm text-neutral-600">Net difference</div><div className="text-2xl font-semibold tabular-nums">{signed(s.netPaise)}</div><div className="text-xs text-neutral-500">{signedUnits(s.netUnits)} units · {s.matching} matched</div></div>
          </section>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Item</th>
                  <th scope="col" className="px-3 py-2 font-medium">Batch</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">System</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Counted</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Difference</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
                  <th scope="col" className="px-3 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byImpact.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">No lines have been counted.</td></tr>
                ) : (
                  byImpact.map((l) => (
                    <tr key={l.id} className={l.variance.units === 0 ? "text-neutral-500" : undefined}>
                      <td className="px-3 py-2">{l.strength ? `${l.itemName} ${l.strength}` : l.itemName}</td>
                      <td className="px-3 py-2">{l.batchNo} <span className="tabular-nums text-neutral-500">({l.expiryDate})</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.systemQty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.countedQty}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{signedUnits(l.variance.units)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{signed(l.variance.valuePaise)}</td>
                      <td className="px-3 py-2 text-xs">{l.movedSince && c.status !== "APPROVED" ? `Stock moved during the count: system now ${l.currentQty}` : ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {s.uncounted > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-neutral-700">{s.uncounted} batch{s.uncounted === 1 ? " was" : "es were"} not counted and will be left unchanged</summary>
              <ul className="mt-2 list-inside list-disc text-neutral-600">
                {c.lines.filter((l) => l.countedQty === null).map((l) => <li key={l.id}>{l.itemName}, batch {l.batchNo} (system {l.systemQty})</li>)}
              </ul>
            </details>
          ) : null}

          {c.status === "SUBMITTED" && moved > 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              {moved} counted batch{moved === 1 ? " has" : "es have"} had stock movements since the count started. Approval adjusts to the quantity counted compared with the stock in the system at the moment you approve. If the movements happened after the shelf was counted, send it back for a recount.
            </p>
          ) : null}

          {c.status === "SUBMITTED" && user.role === "ADMIN" ? <CountDecision id={c.id} netUnits={s.netUnits} lossText={`${signed(s.netPaise)} at cost`} /> : null}
          {c.status === "SUBMITTED" && user.role !== "ADMIN" ? <p className="text-sm text-neutral-600">Waiting for an admin to approve or send it back.</p> : null}
        </>
      )}
    </div>
  );
}
