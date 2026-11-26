import { getTranslations } from "next-intl/server";
import { isExpired, todayIST } from "@/lib/fefo";
import { formatPaise, lineValuePaise } from "@/lib/money";
import type { StockRowView } from "@/lib/ledger";

function daysUntil(day: string, today: string) {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Stock on hand by store and batch. Amber/red only mark expiry (the colour rule from the spec). */
export async function StockTable({ rows }: { rows: StockRowView[] }) {
  const t = await getTranslations("stockTable");
  const tc = await getTranslations("common");
  const today = todayIST();
  if (rows.length === 0) return <p className="text-sm text-neutral-500">{t("none")}</p>;
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  const value = rows.reduce((s, r) => s + lineValuePaise(r.quantity, r.costPaise), 0);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-600">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">{tc("store")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{tc("batch")}</th>
            <th scope="col" className="px-3 py-2 font-medium">{tc("expiry")}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{tc("quantity")}</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{t("valueAtCost")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const days = daysUntil(r.expiryDate, today);
            return (
              <tr key={`${r.storeId}-${r.batchId}`}>
                <td className="px-3 py-2">{r.storeName}</td>
                <td className="px-3 py-2">{r.batchNo}</td>
                <td className="px-3 py-2 tabular-nums">
                  {r.expiryDate}{" "}
                  {isExpired(r.expiryDate, today) ? (
                    <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">{t("expired")}</span>
                  ) : days <= 90 ? (
                    <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">{t("days", { days })}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPaise(lineValuePaise(r.quantity, r.costPaise))}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-neutral-50 font-medium">
          <tr>
            <td colSpan={3} className="px-3 py-2">{tc("total")}</td>
            <td className="px-3 py-2 text-right tabular-nums">{total}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatPaise(value)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
