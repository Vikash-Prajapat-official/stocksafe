// Read-only queries behind the expiry centre, the reorder list and the dashboard.

import { db } from "@/lib/db";
import { isExpired, toDay, todayIST } from "@/lib/fefo";
import { bandOf, daysLeft, makeBands, parseBands, summarizeBands, type Band } from "@/lib/expiry-bands";
import { lineValuePaise } from "@/lib/money";
import { assessReorder, type ReorderStatus } from "@/lib/reorder";

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const MAX_ROWS = 2000;

export function expiryBands(): Band[] {
  return makeBands(parseBands(process.env.EXPIRY_ALERT_DAYS));
}

export type ExpiryRow = {
  storeId: string;
  storeName: string;
  itemId: string;
  itemName: string;
  strength: string | null;
  unit: string;
  batchId: string;
  batchNo: string;
  expiryDate: string;
  daysLeft: number;
  quantity: number;
  costPaise: number;
  valuePaise: number;
  band: string;
};

/**
 * Stock that is expired or expires within the last band (default 90 days), one row per store and batch, with its
 * value at cost. Rows are ordered earliest expiry first.
 */
export async function getExpiryList(opts: { storeId?: string; today?: string } = {}) {
  const today = opts.today ?? todayIST();
  const bands = expiryBands();
  const last = bands[bands.length - 1]!.maxDays;
  const limit = addDays(today, last);
  const found = await db.stockBalance.findMany({
    where: {
      quantity: { gt: 0 },
      batch: { expiryDate: { lte: new Date(`${limit}T00:00:00Z`) } },
      ...(opts.storeId ? { storeId: opts.storeId } : {}),
    },
    include: {
      store: { select: { name: true } },
      batch: { include: { item: { select: { id: true, name: true, strength: true, unit: true } } } },
    },
    orderBy: [{ batch: { expiryDate: "asc" } }, { batch: { item: { name: "asc" } } }, { store: { name: "asc" } }],
    take: MAX_ROWS,
  });
  const raw = found.map((r) => ({
    storeId: r.storeId,
    storeName: r.store.name,
    itemId: r.batch.item.id,
    itemName: r.batch.item.name,
    strength: r.batch.item.strength,
    unit: r.batch.item.unit,
    batchId: r.batchId,
    batchNo: r.batch.batchNo,
    expiryDate: r.batch.expiryDate,
    quantity: r.quantity,
    costPaise: r.batch.costPaise,
  }));

  const rows: ExpiryRow[] = raw.map((r) => {
    const days = daysLeft(r.expiryDate, today);
    return {
      ...r,
      expiryDate: toDay(r.expiryDate),
      daysLeft: days,
      valuePaise: lineValuePaise(r.quantity, r.costPaise),
      band: bandOf(days, bands)?.key ?? "none",
    };
  });
  return { today, bands, summary: summarizeBands(rows, bands), rows, truncated: raw.length === MAX_ROWS };
}

export type LowStockRow = {
  itemId: string;
  name: string;
  strength: string | null;
  unit: string;
  onHand: number;
  expiredQty: number;
  minLevel: number;
  reorderLevel: number;
  maxLevel: number;
  status: Exclude<ReorderStatus, "OK">;
  belowMin: boolean;
  target: number;
  suggested: number;
};

/**
 * Items below their reorder level. On-hand counts only usable (not expired) stock, across all stores or one store.
 * Suggested quantity = maximum - on-hand (see reorder.ts). Stock-outs come first.
 */
export async function getLowStock(opts: { storeId?: string; today?: string } = {}): Promise<LowStockRow[]> {
  const today = opts.today ?? todayIST();
  const items = await db.item.findMany({
    where: { active: true, OR: [{ reorderLevel: { gt: 0 } }, { minLevel: { gt: 0 } }] },
    select: { id: true, name: true, strength: true, unit: true, minLevel: true, reorderLevel: true, maxLevel: true },
  });
  const held = items.length
    ? await db.stockBalance.findMany({
        where: { quantity: { gt: 0 }, batch: { itemId: { in: items.map((i) => i.id) } }, ...(opts.storeId ? { storeId: opts.storeId } : {}) },
        select: { quantity: true, batch: { select: { itemId: true, expiryDate: true } } },
      })
    : [];
  const usable = new Map<string, number>();
  const expired = new Map<string, number>();
  for (const b of held) {
    const m = isExpired(b.batch.expiryDate, today) ? expired : usable;
    m.set(b.batch.itemId, (m.get(b.batch.itemId) ?? 0) + b.quantity);
  }
  const raw = items.map((i) => ({
    itemId: i.id,
    name: i.name,
    strength: i.strength,
    unit: i.unit,
    minLevel: i.minLevel,
    reorderLevel: i.reorderLevel,
    maxLevel: i.maxLevel,
    onHand: usable.get(i.id) ?? 0,
    expiredQty: expired.get(i.id) ?? 0,
  }));

  const rows: LowStockRow[] = [];
  for (const r of raw) {
    const a = assessReorder(r);
    if (!a.tracked || a.status === "OK") continue;
    rows.push({ ...r, status: a.status, belowMin: a.belowMin, target: a.target, suggested: a.suggested });
  }
  const rank = (r: LowStockRow) => (r.status === "OUT" ? 0 : r.belowMin ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
