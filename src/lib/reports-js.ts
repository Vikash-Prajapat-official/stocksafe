// Portable (database-independent) versions of the report queries. PostgreSQL normally answers these with SQL over the
// views report_stock_on_hand / report_consumption (see reports.ts); SQLite (single-PC mode) has no such views, so these do
// the same work in code from the same ledger and balance rows. A test runs both engines on the same data and requires
// identical results, so the two can never drift apart.

import { db } from "@/lib/db";
import { toDay } from "@/lib/fefo";

const addDays = (day: string, k: number) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
/** The India calendar day of a moment. */
const istDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export async function stockRawJs(storeId: string | undefined, today: string) {
  const rows = await db.stockBalance.findMany({
    where: { quantity: { gt: 0 }, ...(storeId ? { storeId } : {}) },
    include: { batch: { include: { item: { select: { id: true, name: true, strength: true, unit: true } } } } },
  });
  const byItem = new Map<string, { itemName: string; strength: string | null; unit: string; usableQty: number; expiredQty: number; usableValue: number; expiredValue: number }>();
  for (const r of rows) {
    const it = r.batch.item;
    const g = byItem.get(it.id) ?? { itemName: it.name, strength: it.strength, unit: it.unit, usableQty: 0, expiredQty: 0, usableValue: 0, expiredValue: 0 };
    const value = r.quantity * r.batch.costPaise;
    if (toDay(r.batch.expiryDate) >= today) {
      g.usableQty += r.quantity;
      g.usableValue += value;
    } else {
      g.expiredQty += r.quantity;
      g.expiredValue += value;
    }
    byItem.set(it.id, g);
  }
  return [...byItem.values()].sort((a, b) => cmp(a.itemName, b.itemName) || cmp(a.strength ?? "", b.strength ?? ""));
}

type Group = { month: string; itemId: string; name: string; strength: string | null; unit: string; issued: number; dispensed: number; writtenOff: number; value: number };

async function consumptionGroups(storeId: string | undefined, fromMonthStart: string): Promise<Group[]> {
  const moves = await db.stockMovement.findMany({
    where: {
      type: { in: ["ISSUE", "DISPENSE", "EXPIRY_WRITEOFF"] },
      at: { gte: new Date(`${fromMonthStart}T00:00:00+05:30`) },
      ...(storeId ? { storeId } : {}),
    },
    select: { type: true, quantity: true, at: true, batch: { select: { costPaise: true, item: { select: { id: true, name: true, strength: true, unit: true } } } } },
  });
  const groups = new Map<string, Group>();
  for (const m of moves) {
    const it = m.batch.item;
    const month = istDay(m.at).slice(0, 7);
    const k = `${month}|${it.id}`;
    const g = groups.get(k) ?? { month, itemId: it.id, name: it.name, strength: it.strength, unit: it.unit, issued: 0, dispensed: 0, writtenOff: 0, value: 0 };
    const out = -m.quantity;
    if (m.type === "ISSUE") g.issued += out;
    else if (m.type === "DISPENSE") g.dispensed += out;
    else g.writtenOff += out;
    if (m.type === "ISSUE" || m.type === "DISPENSE") g.value += out * m.batch.costPaise;
    groups.set(k, g);
  }
  return [...groups.values()];
}

export async function consumptionRawJs(storeId: string | undefined, fromMonthStart: string) {
  const gs = await consumptionGroups(storeId, fromMonthStart);
  return gs
    .sort((a, b) => cmp(b.month, a.month) || b.value - a.value || cmp(a.name, b.name))
    .map((g) => ({ month: g.month, name: g.name, strength: g.strength, unit: g.unit, issued: g.issued, dispensed: g.dispensed, writtenOff: g.writtenOff, value: g.value }));
}

export async function abcRawJs(storeId: string | undefined, fromMonthStart: string) {
  const gs = await consumptionGroups(storeId, fromMonthStart);
  const byItem = new Map<string, { id: string; name: string; strength: string | null; unit: string; qty: number; value: number }>();
  for (const g of gs) {
    const x = byItem.get(g.itemId) ?? { id: g.itemId, name: g.name, strength: g.strength, unit: g.unit, qty: 0, value: 0 };
    x.qty += g.issued + g.dispensed;
    x.value += g.value;
    byItem.set(g.itemId, x);
  }
  return [...byItem.values()].filter((x) => x.value > 0);
}

export async function stockoutRawJs(storeId: string | undefined, from: string, today: string) {
  const moves = await db.stockMovement.findMany({
    where: { at: { lt: new Date(`${addDays(today, 1)}T00:00:00+05:30`) }, ...(storeId ? { storeId } : {}) },
    select: { quantity: true, at: true, batchId: true, batch: { select: { expiryDate: true, item: { select: { id: true, name: true, strength: true, unit: true } } } } },
  });
  type Batch = { expiry: string; deltas: Map<string, number> };
  const items = new Map<string, { name: string; strength: string | null; unit: string; first: string | null; batches: Map<string, Batch> }>();
  for (const m of moves) {
    const it = m.batch.item;
    const g = items.get(it.id) ?? { name: it.name, strength: it.strength, unit: it.unit, first: null, batches: new Map<string, Batch>() };
    const b = g.batches.get(m.batchId) ?? { expiry: toDay(m.batch.expiryDate), deltas: new Map<string, number>() };
    const day = istDay(m.at);
    b.deltas.set(day, (b.deltas.get(day) ?? 0) + m.quantity);
    g.batches.set(m.batchId, b);
    if (m.quantity > 0 && (g.first === null || day < g.first)) g.first = day;
    items.set(it.id, g);
  }
  const days: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(d);

  const out: { name: string; strength: string | null; unit: string; firstDay: Date; tracked: number; stockout: number; outNow: boolean }[] = [];
  for (const g of items.values()) {
    if (g.first === null) continue;
    // balance of every batch just before the window starts, then roll forward one day at a time
    const balance = new Map<Batch, number>();
    for (const b of g.batches.values()) {
      let start = 0;
      for (const [day, q] of b.deltas) if (day < from) start += q;
      balance.set(b, start);
    }
    let tracked = 0;
    let stockout = 0;
    let outNow = false;
    for (const d of days) {
      let usable = 0;
      for (const [b, bal] of balance) {
        const next = bal + (b.deltas.get(d) ?? 0);
        balance.set(b, next);
        if (b.expiry >= d) usable += next;
      }
      if (d < g.first) continue;
      tracked++;
      if (usable <= 0) stockout++;
      if (d === today) outNow = usable <= 0;
    }
    if (stockout > 0) out.push({ name: g.name, strength: g.strength, unit: g.unit, firstDay: new Date(`${g.first}T00:00:00Z`), tracked, stockout, outNow });
  }
  return out.sort((a, b) => b.stockout - a.stockout || cmp(a.name, b.name));
}
