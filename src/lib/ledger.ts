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
  const rows = await db.stockBalance.findMany({
    where: { quantity: { gt: 0 }, batch: { itemId: opts.itemId }, ...(opts.storeId ? { storeId: opts.storeId } : {}) },
    include: { store: { select: { name: true } }, batch: { select: { batchNo: true, expiryDate: true, mrpPaise: true, costPaise: true } } },
  });
  const today = todayIST();
  return rows
    .map((r) => ({
      storeId: r.storeId,
      storeName: r.store.name,
      batchId: r.batchId,
      batchNo: r.batch.batchNo,
      expiryDate: toDay(r.batch.expiryDate),
      expired: isExpired(r.batch.expiryDate, today),
      quantity: r.quantity,
      mrpPaise: r.batch.mrpPaise,
      costPaise: r.batch.costPaise,
    }))
    .sort((x, y) => x.storeName.localeCompare(y.storeName) || x.expiryDate.localeCompare(y.expiryDate) || x.batchNo.localeCompare(y.batchNo));
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
  const all = await db.stockMovement.findMany({
    where: { batch: { itemId: opts.itemId }, ...(opts.storeId ? { storeId: opts.storeId } : {}), ...(opts.batchId ? { batchId: opts.batchId } : {}) },
    orderBy: { seq: "asc" },
    include: {
      batch: { select: { batchNo: true, expiryDate: true } },
      store: { select: { name: true } },
      actor: { select: { name: true } },
      patient: { select: { label: true, anonymisedAt: true } },
    },
  });
  // The running balance is computed over the whole history, then paged, so a page always shows true balances.
  const running = new Map<string, number>();
  const rows: LedgerRow[] = all.map((m) => {
    const k = `${m.storeId}|${m.batchId}`;
    const balanceAfter = (running.get(k) ?? 0) + m.quantity;
    running.set(k, balanceAfter);
    return {
      id: m.id,
      seq: m.seq,
      at: m.at,
      type: m.type,
      storeId: m.storeId,
      storeName: m.store.name,
      batchId: m.batchId,
      batchNo: m.batch.batchNo,
      expiryDate: toDay(m.batch.expiryDate),
      quantity: m.quantity,
      balanceAfter,
      reason: m.reason,
      patientLabel: m.patient ? (m.patient.anonymisedAt ? "[anonymised]" : m.patient.label) : null,
      refType: m.refType,
      refId: m.refId,
      actorName: m.actor.name,
    };
  });
  const ordered = opts.order === "desc" ? rows.reverse() : rows;
  return { rows: ordered.slice(offset, offset + limit), total: rows.length };
}
