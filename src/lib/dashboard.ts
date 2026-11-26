import { getExpiryList, getLowStock } from "@/lib/alerts";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/fefo";

/** Everything the dashboard shows, hospital-wide or for one store. */
export async function getDashboard(opts: { storeId?: string; today?: string } = {}) {
  const today = opts.today ?? todayIST();
  const [expiry, low, pendingIndents, openCounts, recent] = await Promise.all([
    getExpiryList({ storeId: opts.storeId, today }),
    getLowStock({ storeId: opts.storeId, today }),
    db.indent.count({ where: { status: "SUBMITTED", ...(opts.storeId ? { toStoreId: opts.storeId } : {}) } }),
    db.stockCount.count({ where: { status: { in: ["OPEN", "SUBMITTED"] }, ...(opts.storeId ? { storeId: opts.storeId } : {}) } }),
    db.stockMovement.findMany({
      where: opts.storeId ? { storeId: opts.storeId } : {},
      orderBy: { seq: "desc" },
      take: 10,
      include: {
        batch: { select: { batchNo: true, item: { select: { name: true } } } },
        store: { select: { name: true } },
        actor: { select: { name: true } },
      },
    }),
  ]);

  const byKey = new Map(expiry.summary.map((s) => [s.key, s]));
  const expired = byKey.get("expired") ?? { key: "expired", count: 0, valuePaise: 0 };
  return {
    today,
    expired: { count: expired.count, valuePaise: expired.valuePaise },
    bands: expiry.bands
      .filter((b) => b.key !== "expired")
      .map((b) => ({ key: b.key, label: b.label, minDays: b.minDays, maxDays: b.maxDays, count: byKey.get(b.key)?.count ?? 0, valuePaise: byKey.get(b.key)?.valuePaise ?? 0 })),
    lowStockCount: low.length,
    outCount: low.filter((r) => r.status === "OUT").length,
    pendingIndents,
    openCounts,
    recent: recent.map((m) => ({
      id: m.id,
      at: m.at,
      type: m.type as string,
      quantity: m.quantity,
      itemName: m.batch.item.name,
      batchNo: m.batch.batchNo,
      storeName: m.store.name,
      actorName: m.actor.name,
    })),
  };
}
