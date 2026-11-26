import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isExpired, toDay, todayIST } from "@/lib/fefo";

export const MOVEMENT_LABELS: Record<string, string> = {
  RECEIPT: "Received",
  ISSUE: "Issued",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  DISPENSE: "Dispensed",
  RETURN_IN: "Returned in",
  RETURN_TO_SUPPLIER: "Returned to supplier",
  ADJUSTMENT: "Adjustment",
  EXPIRY_WRITEOFF: "Expiry write-off",
};

export type StockRowView = {
  storeId: string;
  storeName: string;
  batchId: string;
  batchNo: string;
  expiryDate: string;
  expired: boolean;
  quantity: number;
  mrpPaise: number;
  costPaise: number;
};

/** Stock on hand for one item: one row per store and batch, earliest expiry first. Empty balances are left out. */
export async function getStockRows(opts: { itemId: string; storeId?: string }): Promise<StockRowView[]> {
  const storeF = opts.storeId ? Prisma.sql`AND sb.store_id = ${opts.storeId}` : Prisma.empty;
  const rows = await db.$queryRaw<
    { storeId: string; storeName: string; batchId: string; batchNo: string; expiryDate: Date; quantity: number; mrpPaise: number; costPaise: number }[]
  >`
    SELECT sb.store_id AS "storeId", s.name AS "storeName", sb.batch_id AS "batchId", b.batch_no AS "batchNo",
           b.expiry_date AS "expiryDate", sb.quantity, b.mrp_paise AS "mrpPaise", b.cost_paise AS "costPaise"
    FROM stock_balance sb
    JOIN batch b ON b.id = sb.batch_id
    JOIN store s ON s.id = sb.store_id
    WHERE b.item_id = ${opts.itemId} AND sb.quantity > 0 ${storeF}
    ORDER BY s.name, b.expiry_date, b.batch_no`;
  const today = todayIST();
  return rows.map((r) => ({ ...r, expiryDate: toDay(r.expiryDate), expired: isExpired(r.expiryDate, today) }));
}

export type LedgerRow = {
  id: string;
  seq: number;
  at: Date;
  type: string;
  storeId: string;
  storeName: string;
  batchId: string;
  batchNo: string;
  expiryDate: string;
  /** Signed: positive in, negative out. */
  quantity: number;
  /** Running balance of this store + batch right after this movement. */
  balanceAfter: number;
  reason: string | null;
  patientLabel: string | null;
  refType: string | null;
  refId: string | null;
  actorName: string;
};

/**
 * Bin card for one item: its movements with a running balance per store and batch.
 * The running balance is computed over the whole history, then paged, so a page always shows true balances.
 */
export async function getLedger(opts: {
  itemId: string;
  storeId?: string;
  batchId?: string;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}): Promise<{ rows: LedgerRow[]; total: number }> {
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? 100)), 500);
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0));
  const storeF = opts.storeId ? Prisma.sql`AND m.store_id = ${opts.storeId}` : Prisma.empty;
  const batchF = opts.batchId ? Prisma.sql`AND m.batch_id = ${opts.batchId}` : Prisma.empty;
  const direction = opts.order === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;

  type Raw = Omit<LedgerRow, "expiryDate" | "seq" | "quantity" | "balanceAfter"> & {
    expiryDate: Date;
    seq: number;
    quantity: number;
    balanceAfter: number;
  };
  const [rows, count] = await Promise.all([
    db.$queryRaw<Raw[]>`
      WITH all_rows AS (
        SELECT m.id, m.seq, m."at", m.type::text AS type, m.store_id AS "storeId", s.name AS "storeName",
               m.batch_id AS "batchId", b.batch_no AS "batchNo", b.expiry_date AS "expiryDate", m.quantity,
               SUM(m.quantity) OVER (PARTITION BY m.store_id, m.batch_id ORDER BY m.seq)::int AS "balanceAfter",
               m.reason, CASE WHEN mp.anonymised_at IS NOT NULL THEN '[anonymised]' ELSE mp.label END AS "patientLabel", m.ref_type AS "refType", m.ref_id AS "refId", u.name AS "actorName"
        FROM stock_movement m
        JOIN batch b ON b.id = m.batch_id
        JOIN store s ON s.id = m.store_id
        JOIN "user" u ON u.id = m.actor_user_id
        LEFT JOIN movement_patient mp ON mp.movement_id = m.id
        WHERE b.item_id = ${opts.itemId} ${storeF} ${batchF}
      )
      SELECT * FROM all_rows ORDER BY seq ${direction} LIMIT ${limit} OFFSET ${offset}`,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM stock_movement m JOIN batch b ON b.id = m.batch_id
      WHERE b.item_id = ${opts.itemId} ${storeF} ${batchF}`,
  ]);
  return {
    rows: rows.map((r) => ({ ...r, expiryDate: toDay(r.expiryDate) })),
    total: Number(count[0]?.n ?? 0),
  };
}
