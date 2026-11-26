import { Prisma } from "@prisma/client";
import { getExpiryList, getLowStock } from "@/lib/alerts";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/fefo";

/** Everything the dashboard shows, hospital-wide or for one store. */
export async function getDashboard(opts: { storeId?: string; today?: string } = {}) {
  const today = opts.today ?? todayIST();
  const storeF = opts.storeId ? Prisma.sql`WHERE m.store_id = ${opts.storeId}` : Prisma.empty;

  const [expiry, low, pendingIndents, openCounts, recent] = await Promise.all([
    getExpiryList({ storeId: opts.storeId, today }),
    getLowStock({ storeId: opts.storeId, today }),
    db.indent.count({ where: { status: "SUBMITTED", ...(opts.storeId ? { toStoreId: opts.storeId } : {}) } }),
    db.stockCount.count({ where: { status: { in: ["OPEN", "SUBMITTED"] }, ...(opts.storeId ? { storeId: opts.storeId } : {}) } }),
    db.$queryRaw<
      { id: string; at: Date; type: string; quantity: number; itemName: string; batchNo: string; storeName: string; actorName: string }[]
    >`
      SELECT m.id, m."at", m.type::text AS type, m.quantity, i.name AS "itemName", b.batch_no AS "batchNo", s.name AS "storeName", u.name AS "actorName"
      FROM stock_movement m
      JOIN batch b ON b.id = m.batch_id
      JOIN item i ON i.id = b.item_id
      JOIN store s ON s.id = m.store_id
      JOIN "user" u ON u.id = m.actor_user_id
      ${storeF}
      ORDER BY m.seq DESC
      LIMIT 10`,
  ]);

  const byKey = new Map(expiry.summary.map((s) => [s.key, s]));
  const expired = byKey.get("expired") ?? { key: "expired", count: 0, valuePaise: 0 };
  return {
    today,
    expired: { count: expired.count, valuePaise: expired.valuePaise },
    bands: expiry.bands
      .filter((b) => b.key !== "expired")
      .map((b) => ({ key: b.key, label: b.label, count: byKey.get(b.key)?.count ?? 0, valuePaise: byKey.get(b.key)?.valuePaise ?? 0 })),
    lowStockCount: low.length,
    outCount: low.filter((r) => r.status === "OUT").length,
    pendingIndents,
    openCounts,
    recent,
  };
}
