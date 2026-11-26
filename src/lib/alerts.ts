// Read-only queries behind the expiry centre, the reorder list and the dashboard.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toDay, todayIST } from "@/lib/fefo";
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
  const storeF = opts.storeId ? Prisma.sql`AND sb.store_id = ${opts.storeId}` : Prisma.empty;

  const raw = await db.$queryRaw<
    { storeId: string; storeName: string; itemId: string; itemName: string; strength: string | null; unit: string; batchId: string; batchNo: string; expiryDate: Date; quantity: number; costPaise: number }[]
  >`
    SELECT sb.store_id AS "storeId", s.name AS "storeName", i.id AS "itemId", i.name AS "itemName", i.strength, i.unit,
           sb.batch_id AS "batchId", b.batch_no AS "batchNo", b.expiry_date AS "expiryDate", sb.quantity, b.cost_paise AS "costPaise"
    FROM stock_balance sb
    JOIN batch b ON b.id = sb.batch_id
    JOIN item i ON i.id = b.item_id
    JOIN store s ON s.id = sb.store_id
    WHERE sb.quantity > 0 AND b.expiry_date <= ${limit}::date ${storeF}
    ORDER BY b.expiry_date, i.name, s.name
    LIMIT ${MAX_ROWS}`;

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
  const storeJoin = opts.storeId ? Prisma.sql`AND sb.store_id = ${opts.storeId}` : Prisma.empty;
  const raw = await db.$queryRaw<
    { itemId: string; name: string; strength: string | null; unit: string; minLevel: number; reorderLevel: number; maxLevel: number; onHand: number; expiredQty: number }[]
  >`
    SELECT i.id AS "itemId", i.name, i.strength, i.unit, i.min_level AS "minLevel", i.reorder_level AS "reorderLevel", i.max_level AS "maxLevel",
           COALESCE(SUM(sb.quantity) FILTER (WHERE b.expiry_date >= ${today}::date), 0)::int AS "onHand",
           COALESCE(SUM(sb.quantity) FILTER (WHERE b.expiry_date < ${today}::date), 0)::int AS "expiredQty"
    FROM item i
    LEFT JOIN batch b ON b.item_id = i.id
    LEFT JOIN stock_balance sb ON sb.batch_id = b.id ${storeJoin}
    WHERE i.active AND (i.reorder_level > 0 OR i.min_level > 0)
    GROUP BY i.id`;

  const rows: LowStockRow[] = [];
  for (const r of raw) {
    const a = assessReorder(r);
    if (!a.tracked || a.status === "OK") continue;
    rows.push({ ...r, status: a.status, belowMin: a.belowMin, target: a.target, suggested: a.suggested });
  }
  const rank = (r: LowStockRow) => (r.status === "OUT" ? 0 : r.belowMin ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
