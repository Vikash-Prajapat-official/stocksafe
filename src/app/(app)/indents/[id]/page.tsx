import Link from "next/link";
import { notFound } from "next/navigation";
import { IndentActions } from "@/components/indent-actions";
import { Badge } from "@/components/ui/fields";
import { ApiError } from "@/lib/api-error";
import { db } from "@/lib/db";
import { INDENT_STATUS_LABEL, outstanding } from "@/lib/indent-flow";
import { getIndent } from "@/lib/indents";
import { getStockRows } from "@/lib/ledger";
import { requirePageUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function IndentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(["NURSE", "STOREKEEPER", "ADMIN", "AUDITOR"]);
  const { id } = await params;
  const ind = await getIndent(user, id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const fmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

  // Admins and auditors can look but not act (the spec gives indent actions to the ward nurse and the store keeper).
  const mine = new Set((await db.userStore.findMany({ where: { userId: user.id }, select: { storeId: true } })).map((s) => s.storeId));
  const canAct = user.role === "NURSE" ? mine.has(ind.fromStoreId) : user.role === "STOREKEEPER" ? mine.has(ind.toStoreId) : false;

  // For the keeper deciding or issuing: how much usable stock the supplying store has of each item right now.
  const showStock = user.role === "STOREKEEPER" && ["SUBMITTED", "APPROVED", "PARTIAL"].includes(ind.status);
  const available = new Map<string, number>();
  if (showStock) {
    for (const l of ind.lines) {
      const rows = await getStockRows({ itemId: l.itemId, storeId: ind.toStoreId });
      available.set(l.itemId, rows.filter((r) => !r.expired).reduce((s, r) => s + r.quantity, 0));
    }
  }
  const decided = ind.status !== "DRAFT" && ind.status !== "SUBMITTED";

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link href="/indents" className="text-sm text-primary hover:underline">← All indents</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Indent #{ind.seq}</h1>
          <Badge tone={ind.status === "REJECTED" || ind.status === "DRAFT" || ind.status === "SUBMITTED" ? "neutral" : "green"}>{INDENT_STATUS_LABEL[ind.status]}</Badge>
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          {ind.fromStore.name} asked {ind.toStore.name} · raised by {ind.creator.name} · <span className="tabular-nums">{fmt.format(ind.createdAt)}</span>
        </p>
        {ind.note ? <p className="mt-2 text-sm">Ward note: {ind.note}</p> : null}
        {ind.decisionNote ? <p className="mt-1 text-sm">Store note: {ind.decisionNote}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Item</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Requested</th>
              {decided ? <th scope="col" className="px-3 py-2 text-right font-medium">Approved</th> : null}
              {decided ? <th scope="col" className="px-3 py-2 text-right font-medium">Issued</th> : null}
              {decided && ind.status !== "REJECTED" ? <th scope="col" className="px-3 py-2 text-right font-medium">Still to issue</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {ind.lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">{l.item.strength ? `${l.item.name} ${l.item.strength}` : l.item.name} <span className="text-neutral-500">({l.item.unit})</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{l.qtyRequested}</td>
                {decided ? <td className="px-3 py-2 text-right tabular-nums">{l.qtyApproved ?? "-"}</td> : null}
                {decided ? <td className="px-3 py-2 text-right tabular-nums">{l.qtyIssued}</td> : null}
                {decided && ind.status !== "REJECTED" ? <td className="px-3 py-2 text-right tabular-nums">{ind.status === "ISSUED" ? 0 : outstanding(l)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <IndentActions
        id={ind.id}
        status={ind.status}
        role={user.role}
        canAct={canAct}
        lines={ind.lines.map((l) => ({
          id: l.id,
          name: l.item.strength ? `${l.item.name} ${l.item.strength}` : l.item.name,
          unit: l.item.unit,
          requested: l.qtyRequested,
          approved: l.qtyApproved,
          issued: l.qtyIssued,
          available: showStock ? (available.get(l.itemId) ?? 0) : null,
        }))}
      />
    </div>
  );
}
