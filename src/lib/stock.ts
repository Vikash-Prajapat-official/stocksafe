// ALL stock changes go through this file, and nowhere else.
//
// Rules (SPEC sections 4 and 5):
//  - Every function runs in ONE database transaction that changes StockBalance and inserts the
//    matching StockMovement rows together. If anything fails, nothing is written.
//  - The ledger (StockMovement) is append-only: this file only ever INSERTs into it. A database
//    trigger also rejects UPDATE/DELETE/TRUNCATE.
//  - Two users can never issue the same last unit: each operation takes a per-item advisory lock
//    (so operations on the same item queue up and cannot deadlock each other) and locks the balance
//    rows it reads with SELECT ... FOR UPDATE, so it always sees the committed result of the one before.
//  - Quantities are whole numbers in the item's unit; money is integer paise.

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isSqlite } from "@/lib/dialect";
import { isExpired, splitFefo, toDay, todayIST } from "@/lib/fefo";
import { canDo, outstanding, statusAfterIssue, type IndentStatus } from "@/lib/indent-flow";
import { writeAudit } from "@/lib/audit";
import { stampTime } from "@/lib/clock";
import { MAX_PAISE, lineValuePaise } from "@/lib/money";
import { nextSeq } from "@/lib/seq";
import { StockError } from "@/lib/stock-errors";

export { StockError } from "@/lib/stock-errors";

type Tx = Prisma.TransactionClient;
export type Opts = {
  /** Override "today" (YYYY-MM-DD). For tests only. Defaults to today's date in India. */
  today?: string;
};

export type IssueLine = {
  itemId: string;
  quantity: number;
  /** Choose a specific batch instead of FEFO. Needs `overrideReason`. Expired batches are never allowed. */
  batchId?: string | null;
  overrideReason?: string | null;
};
export type Pick = { itemId: string; batchId: string; batchNo: string; expiryDate: string; quantity: number };
export type StockResult = { refId: string; picks: Pick[] };

const MAX_QTY = 10_000_000;
const MAX_LINES = 200;

// ---------- small helpers ----------

const bad = (message: string, details?: Record<string, unknown>) => new StockError("VALIDATION", message, details);

function validDay(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s; // rejects 2027-02-30 and 2027-13-45
}
function checkQty(v: unknown, what = "quantity"): asserts v is number {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0 || v > MAX_QTY)
    throw bad(`${what} must be a whole number from 1 to ${MAX_QTY.toLocaleString("en-IN")}`);
}
function checkPaise(v: unknown, what: string): asserts v is number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_PAISE)
    throw bad(`${what} must be whole paise from 0 to ${MAX_PAISE}`);
}
function text(v: string | null | undefined, what: string, min: number, max: number): string {
  const s = (v ?? "").trim().replace(/\s+/g, " ");
  if (s.length < min) throw bad(min > 0 ? `${what} is required` : `${what} is invalid`);
  if (s.length > max) throw bad(`${what} must be at most ${max} characters`);
  return s;
}
/** Batch numbers are compared ignoring case and extra spaces, so typing variants hit one batch. */
const normBatchNo = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

function checkLines(lines: readonly IssueLine[]) {
  if (!Array.isArray(lines) || lines.length === 0) throw bad("Add at least one line");
  if (lines.length > MAX_LINES) throw bad(`At most ${MAX_LINES} lines at a time`);
  for (const l of lines) {
    if (!l || typeof l.itemId !== "string" || !l.itemId) throw bad("Every line needs an item");
    checkQty(l.quantity);
  }
}

function retryable(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code === "P2034" || e.code === "P2002") return true; // write conflict / deadlock / unique-index race
  return /40P01|40001|deadlock detected|could not serialize/i.test(`${e.message} ${JSON.stringify(e.meta ?? {})}`);
}

/** Runs `fn` in a transaction; retries (up to 5 times) if Postgres aborts it for a deadlock or write conflict. */
async function run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(fn, { maxWait: 30_000, timeout: 60_000 });
    } catch (e) {
      if (attempt < 5 && retryable(e)) {
        await new Promise((r) => setTimeout(r, 15 * attempt + Math.random() * 40));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Serialises concurrent operations on the same keys (item ids, "indent:<id>", "count:<id>"). PostgreSQL: transaction-level
 * advisory locks, taken in sorted order so they cannot deadlock. SQLite: nothing to do, because single-PC mode runs on
 * one connection, so write transactions already run one at a time.
 */
async function lockKeys(tx: Tx, keys: Iterable<string>) {
  if (isSqlite) return;
  for (const k of [...new Set(keys)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${k}, 0))`;
  }
}
const lockItems = (tx: Tx, itemIds: Iterable<string>) => lockKeys(tx, itemIds);

async function requireStore(tx: Tx, id: string, label = "Store") {
  const s = await tx.store.findUnique({ where: { id }, select: { id: true, active: true, name: true } });
  if (!s) throw new StockError("NOT_FOUND", `${label} not found`);
  if (!s.active) throw new StockError("INACTIVE", `${label} "${s.name}" is not active`);
  return s;
}

async function requireApprover(tx: Tx, userId: string | null | undefined) {
  const u = userId ? await tx.user.findUnique({ where: { id: userId }, select: { role: true, active: true } }) : null;
  if (!u || !u.active || u.role !== "ADMIN")
    throw new StockError("APPROVER_REQUIRED", "This needs the approval of an active admin");
}

/** Adds `delta` to a balance row (creating it if needed). Never lets it go below zero (the decrement only matches if enough is there). */
async function addBalance(tx: Tx, storeId: string, batchId: string, delta: number) {
  try {
    if (delta > 0) {
      await tx.stockBalance.upsert({
        where: { storeId_batchId: { storeId, batchId } },
        create: { storeId, batchId, quantity: delta },
        update: { quantity: { increment: delta } },
      });
    } else {
      const r = await tx.stockBalance.updateMany({ where: { storeId, batchId, quantity: { gte: -delta } }, data: { quantity: { increment: delta } } });
      if (r.count !== 1) throw new StockError("INSUFFICIENT_STOCK", "Not enough stock", { available: 0 });
    }
  } catch (e) {
    if (e instanceof StockError) throw e;
    if (/stock_balance_quantity_nonnegative|CHECK constraint/i.test(String(e))) throw new StockError("INSUFFICIENT_STOCK", "Not enough stock");
    throw e;
  }
}

type MovementData = {
  type: Prisma.StockMovementUncheckedCreateInput["type"];
  storeId: string;
  batchId: string;
  quantity: number; // signed
  refType: string;
  refId: string;
  actorUserId: string;
  reason?: string | null;
  patientLabel?: string | null;
  approvedBy?: string | null;
};
/** The only place a StockMovement is created. Always paired with addBalance in the same transaction. */
async function post(tx: Tx, m: MovementData): Promise<string> {
  await addBalance(tx, m.storeId, m.batchId, m.quantity);
  const row = await tx.stockMovement.create({
    data: {
      seq: await nextSeq(tx, "stockMovement"),
      type: m.type,
      storeId: m.storeId,
      batchId: m.batchId,
      quantity: m.quantity,
      refType: m.refType,
      refId: m.refId,
      actorUserId: m.actorUserId,
      reason: m.reason ?? null,
      approvedBy: m.approvedBy ?? null,
      ...(stampTime() ? { at: stampTime()! } : {}), // demo history only (see clock.ts)
    },
    select: { id: true },
  });
  // The patient label lives beside the ledger (not in it) so the retention job can anonymise it
  // without ever editing a movement.
  if (m.patientLabel) await tx.movementPatient.create({ data: { movementId: row.id, label: m.patientLabel } });
  return row.id;
}

// ---------- choosing batches (FEFO) ----------

type StockRow = { batchId: string; batchNo: string; expiryDate: Date; quantity: number };

async function stockRows(tx: Tx, storeId: string, itemId: string): Promise<StockRow[]> {
  const rows = await tx.stockBalance.findMany({
    where: { storeId, quantity: { gt: 0 }, batch: { itemId } },
    include: { batch: { select: { batchNo: true, expiryDate: true } } },
  });
  return rows.map((r) => ({ batchId: r.batchId, batchNo: r.batch.batchNo, expiryDate: r.batch.expiryDate, quantity: r.quantity }));
}

type Shortage = { requested: number; available: number; expired: number };
type Planned = { itemId: string; quantity: number; picks: Pick[]; shortage?: Shortage };

/**
 * Works out which batches each line comes from. Writes nothing. With lock=true the rows it reads are
 * locked until the transaction ends. Lines for the same item see what earlier lines already took.
 */
async function plan(tx: Tx, storeId: string, lines: readonly IssueLine[], today: string): Promise<Planned[]> {
  const taken = new Map<string, number>();
  const out: Planned[] = [];
  // Stable sort by item: the same lock order for everyone.
  const ordered = lines.map((l, i) => ({ l, i })).sort((a, b) => (a.l.itemId < b.l.itemId ? -1 : a.l.itemId > b.l.itemId ? 1 : a.i - b.i));

  for (const { l } of ordered) {
    if (l.batchId) {
      out.push(await planOverride(tx, storeId, l, today, taken));
      continue;
    }
    const rows = (await stockRows(tx, storeId, l.itemId)).map((r) => ({ ...r, quantity: r.quantity - (taken.get(r.batchId) ?? 0) }));
    const r = splitFefo(rows.map((x) => ({ batchId: x.batchId, expiryDate: x.expiryDate, quantity: x.quantity })), l.quantity, today);
    if (!r.ok) {
      out.push({ itemId: l.itemId, quantity: l.quantity, picks: [], shortage: { requested: r.requested, available: r.available, expired: r.expired } });
      continue;
    }
    const byId = new Map(rows.map((x) => [x.batchId, x]));
    out.push({
      itemId: l.itemId,
      quantity: l.quantity,
      picks: r.picks.map((p) => {
        taken.set(p.batchId, (taken.get(p.batchId) ?? 0) + p.quantity);
        const row = byId.get(p.batchId)!;
        return { itemId: l.itemId, batchId: p.batchId, batchNo: row.batchNo, expiryDate: toDay(row.expiryDate), quantity: p.quantity };
      }),
    });
  }
  return out;
}

async function planOverride(tx: Tx, storeId: string, l: IssueLine, today: string, taken: Map<string, number>): Promise<Planned> {
  const reason = (l.overrideReason ?? "").trim();
  if (reason.length < 3) throw new StockError("OVERRIDE_REASON_REQUIRED", "Choosing a batch by hand needs a reason (at least 3 characters)");
  const batch = await tx.batch.findUnique({ where: { id: l.batchId! }, select: { id: true, itemId: true, batchNo: true, expiryDate: true } });
  if (!batch || batch.itemId !== l.itemId) throw bad("That batch does not belong to this item");
  if (isExpired(batch.expiryDate, today)) throw new StockError("EXPIRED_BATCH", `Batch ${batch.batchNo} has expired and cannot be issued`, { batchId: batch.id });
  const bal = await tx.stockBalance.findUnique({ where: { storeId_batchId: { storeId, batchId: batch.id } }, select: { quantity: true } });
  const available = (bal?.quantity ?? 0) - (taken.get(batch.id) ?? 0);
  if (available < l.quantity)
    return { itemId: l.itemId, quantity: l.quantity, picks: [], shortage: { requested: l.quantity, available: Math.max(0, available), expired: 0 } };
  taken.set(batch.id, (taken.get(batch.id) ?? 0) + l.quantity);
  return {
    itemId: l.itemId,
    quantity: l.quantity,
    picks: [{ itemId: l.itemId, batchId: batch.id, batchNo: batch.batchNo, expiryDate: toDay(batch.expiryDate), quantity: l.quantity }],
  };
}

function throwIfShort(planned: Planned[]) {
  const s = planned.find((p) => p.shortage);
  if (!s?.shortage) return;
  const { requested, available, expired } = s.shortage;
  throw new StockError(
    "INSUFFICIENT_STOCK",
    `Only ${available} available but ${requested} requested` + (expired ? ` (${expired} more are expired and cannot be used)` : ""),
    { itemId: s.itemId, requested, available, expired },
  );
}

/** Same reason text rule for manual batch choices: the override is recorded on the movement. */
function lineReason(base: string | null, l: IssueLine | undefined): string | null {
  if (l?.batchId && l.overrideReason) return `${base ? base + " | " : ""}FEFO override: ${l.overrideReason.trim()}`;
  return base;
}

/** Shows how a request would be split by FEFO, without changing anything. Used for the confirm step. */
export async function previewPicks(
  input: { storeId: string; lines: IssueLine[] },
  opts: Opts = {},
): Promise<Planned[]> {
  checkLines(input.lines);
  return plan(db as unknown as Tx, input.storeId, input.lines, opts.today ?? todayIST());
}

/** Shared by issue, dispense and transfer: pick under lock, then post the outgoing movements. */
async function takeStock(
  tx: Tx,
  a: {
    storeId: string;
    lines: readonly IssueLine[];
    type: "ISSUE" | "DISPENSE" | "TRANSFER_OUT";
    refType: string;
    refId: string;
    actorUserId: string;
    reason: string | null;
    patientLabel?: string | null;
    today: string;
  },
): Promise<Pick[]> {
  await lockItems(tx, a.lines.map((l) => l.itemId));
  const planned = await plan(tx, a.storeId, a.lines, a.today);
  throwIfShort(planned);
  const picks: Pick[] = [];
  for (const p of planned) {
    const line = a.lines.find((l) => l.itemId === p.itemId && (l.batchId ? l.batchId === p.picks[0]?.batchId : true));
    for (const pick of p.picks) {
      await post(tx, {
        type: a.type,
        storeId: a.storeId,
        batchId: pick.batchId,
        quantity: -pick.quantity,
        refType: a.refType,
        refId: a.refId,
        actorUserId: a.actorUserId,
        reason: lineReason(a.reason, line),
        patientLabel: a.patientLabel ?? null,
      });
      picks.push(pick);
    }
  }
  return picks;
}

// ---------- public operations ----------

export type ReceiveInput = {
  storeId: string;
  supplierId: string;
  invoiceNo: string;
  invoiceDate: string;
  actorUserId: string;
  /** Client IP for the audit log (optional). */
  ip?: string | null;
  lines: {
    itemId: string;
    batchNo: string;
    expiryDate: string;
    quantity: number;
    mrpPaise: number;
    costPaise: number;
  }[];
};

/** Goods receipt (GRN): creates the GRN, creates or finds each batch, adds stock, writes RECEIPT movements. */
export async function receive(input: ReceiveInput, opts: Opts = {}) {
  const today = opts.today ?? todayIST();
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw bad("Add at least one line");
  if (input.lines.length > MAX_LINES) throw bad(`At most ${MAX_LINES} lines at a time`);
  const invoiceNo = text(input.invoiceNo, "Invoice number", 1, 60);
  if (!validDay(input.invoiceDate)) throw bad("Invoice date must be a valid date (YYYY-MM-DD)");
  const lines = input.lines.map((l) => {
    checkQty(l.quantity);
    checkPaise(l.mrpPaise, "MRP");
    checkPaise(l.costPaise, "Purchase price");
    if (!validDay(l.expiryDate)) throw bad("Expiry date must be a valid date (YYYY-MM-DD)");
    const batchNo = normBatchNo(l.batchNo ?? "");
    if (batchNo.length < 1 || batchNo.length > 40) throw bad("Batch number is required (at most 40 characters)");
    if (typeof l.itemId !== "string" || !l.itemId) throw bad("Every line needs an item");
    return { ...l, batchNo };
  });
  const totalPaise = lines.reduce((s, l) => s + lineValuePaise(l.quantity, l.costPaise), 0);
  if (totalPaise > MAX_PAISE) throw bad("The invoice total is too large");

  return run(async (tx) => {
    await requireStore(tx, input.storeId);
    if (!(await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } })))
      throw new StockError("NOT_FOUND", "Supplier not found");
    const itemIds = [...new Set(lines.map((l) => l.itemId))];
    const items = await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, active: true } });
    for (const id of itemIds) {
      const it = items.find((i) => i.id === id);
      if (!it) throw new StockError("NOT_FOUND", "Item not found", { itemId: id });
      if (!it.active) throw new StockError("INACTIVE", `Item "${it.name}" is not active`);
    }
    for (const l of lines)
      if (l.expiryDate < today)
        throw new StockError("EXPIRED_BATCH", `Batch ${l.batchNo} has already expired (${l.expiryDate}) and cannot be received`);

    await lockItems(tx, itemIds);
    const warnings: string[] = [];
    const grn = await tx.grn.create({
      data: {
        supplierId: input.supplierId,
        invoiceNo,
        invoiceDate: new Date(`${input.invoiceDate}T00:00:00Z`),
        receivedBy: input.actorUserId,
        totalPaise,
        ...(stampTime() ? { receivedAt: stampTime()! } : {}),
      },
      select: { id: true },
    });

    const out: { batchId: string; movementId: string }[] = [];
    for (const l of lines) {
      let batch = await tx.batch.findUnique({ where: { itemId_batchNo: { itemId: l.itemId, batchNo: l.batchNo } } });
      if (batch) {
        if (toDay(batch.expiryDate) !== l.expiryDate)
          throw new StockError(
            "BATCH_MISMATCH",
            `Batch ${l.batchNo} is already on record with expiry ${toDay(batch.expiryDate)}, not ${l.expiryDate}. Check the pack.`,
            { batchId: batch.id },
          );
        if (batch.costPaise !== l.costPaise || batch.mrpPaise !== l.mrpPaise)
          warnings.push(`Batch ${l.batchNo}: price differs from the first receipt, so the original price was kept.`);
      } else {
        batch = await tx.batch.create({
          data: {
            itemId: l.itemId,
            batchNo: l.batchNo,
            expiryDate: new Date(`${l.expiryDate}T00:00:00Z`),
            mrpPaise: l.mrpPaise,
            costPaise: l.costPaise,
            supplierId: input.supplierId,
          },
        });
      }
      const movementId = await post(tx, {
        type: "RECEIPT",
        storeId: input.storeId,
        batchId: batch.id,
        quantity: l.quantity,
        refType: "GRN",
        refId: grn.id,
        actorUserId: input.actorUserId,
      });
      out.push({ batchId: batch.id, movementId });
    }
    await writeAudit(tx, { actorUserId: input.actorUserId, action: "GRN_CREATE", entity: "grn", entityId: grn.id, ip: input.ip });
    return { grnId: grn.id, totalPaise, lines: out, warnings };
  });
}

/** Issue stock out of a store (consumption, department use). FEFO unless a batch is chosen with a reason. */
export async function issue(
  input: { storeId: string; lines: IssueLine[]; reason: string; actorUserId: string; ip?: string | null },
  opts: Opts = {},
): Promise<StockResult> {
  checkLines(input.lines);
  const reason = text(input.reason, "Reason", 1, 200);
  return run(async (tx) => {
    await requireStore(tx, input.storeId);
    const refId = randomUUID();
    const picks = await takeStock(tx, {
      storeId: input.storeId,
      lines: input.lines,
      type: "ISSUE",
      refType: "ISSUE",
      refId,
      actorUserId: input.actorUserId,
      reason,
      today: opts.today ?? todayIST(),
    });
    await writeAudit(tx, { actorUserId: input.actorUserId, action: "STOCK_ISSUE", entity: "issue", entityId: refId, ip: input.ip });
    return { refId, picks };
  });
}

/** Moves stock between two stores. Writes TRANSFER_OUT and TRANSFER_IN together, sharing one reference. */
export async function transfer(
  input: { fromStoreId: string; toStoreId: string; lines: IssueLine[]; actorUserId: string; reason?: string | null; ip?: string | null },
  opts: Opts = {},
): Promise<StockResult> {
  checkLines(input.lines);
  if (input.fromStoreId === input.toStoreId) throw new StockError("SAME_STORE", "The two stores must be different");
  const reason = input.reason?.trim() ? text(input.reason, "Reason", 1, 200) : null;
  return run(async (tx) => {
    await requireStore(tx, input.fromStoreId, "Source store");
    await requireStore(tx, input.toStoreId, "Destination store");
    const refId = randomUUID();
    const picks = await takeStock(tx, {
      storeId: input.fromStoreId,
      lines: input.lines,
      type: "TRANSFER_OUT",
      refType: "TRANSFER",
      refId,
      actorUserId: input.actorUserId,
      reason,
      today: opts.today ?? todayIST(),
    });
    for (const p of picks) {
      await post(tx, {
        type: "TRANSFER_IN",
        storeId: input.toStoreId,
        batchId: p.batchId,
        quantity: p.quantity,
        refType: "TRANSFER",
        refId,
        actorUserId: input.actorUserId,
        reason,
      });
    }
    await writeAudit(tx, { actorUserId: input.actorUserId, action: "STOCK_TRANSFER", entity: "transfer", entityId: refId, ip: input.ip });
    return { refId, picks };
  });
}

/** Dispense to a patient (FEFO). The optional patient label is anonymised later by the retention job. */
export async function dispense(
  input: { storeId: string; lines: IssueLine[]; actorUserId: string; patientLabel?: string | null; ip?: string | null },
  opts: Opts = {},
): Promise<StockResult> {
  checkLines(input.lines);
  const label = input.patientLabel?.trim() ? input.patientLabel.trim().replace(/\s+/g, " ") : null;
  if (label && label.length > 100) throw bad("Patient label must be at most 100 characters");
  return run(async (tx) => {
    await requireStore(tx, input.storeId);
    const refId = randomUUID();
    const picks = await takeStock(tx, {
      storeId: input.storeId,
      lines: input.lines,
      type: "DISPENSE",
      refType: "DISPENSE",
      refId,
      actorUserId: input.actorUserId,
      reason: null,
      patientLabel: label,
      today: opts.today ?? todayIST(),
    });
    await writeAudit(tx, { actorUserId: input.actorUserId, action: "STOCK_DISPENSE", entity: "dispense", entityId: refId, ip: input.ip });
    return { refId, picks };
  });
}

type SingleBatchArgs = {
  type: "RETURN_TO_SUPPLIER" | "EXPIRY_WRITEOFF" | "ADJUSTMENT";
  refType: string;
  storeId: string;
  batchId: string;
  /** Signed: negative removes stock. */
  delta: number;
  reason: string;
  actorUserId: string;
  approvedBy: string;
  requireExpired?: boolean;
  today: string;
  ip?: string | null;
};
async function moveOneBatch(a: SingleBatchArgs) {
  return run(async (tx) => {
    await requireApprover(tx, a.approvedBy);
    await requireStore(tx, a.storeId);
    const batch = await tx.batch.findUnique({ where: { id: a.batchId } });
    if (!batch) throw new StockError("NOT_FOUND", "Batch not found");
    await lockItems(tx, [batch.itemId]);
    if (a.requireExpired && !isExpired(batch.expiryDate, a.today))
      throw new StockError("NOT_EXPIRED", `Batch ${batch.batchNo} has not expired (expires ${toDay(batch.expiryDate)}). Use an adjustment or a return instead.`);
    const bal = await tx.stockBalance.findUnique({ where: { storeId_batchId: { storeId: a.storeId, batchId: a.batchId } }, select: { quantity: true } });
    const available = bal?.quantity ?? 0;
    if (a.delta < 0 && available + a.delta < 0)
      throw new StockError("INSUFFICIENT_STOCK", `Only ${available} in stock`, { requested: -a.delta, available });
    const movementId = await post(tx, {
      type: a.type,
      storeId: a.storeId,
      batchId: a.batchId,
      quantity: a.delta,
      refType: a.refType,
      refId: randomUUID(),
      actorUserId: a.actorUserId,
      reason: a.reason,
      approvedBy: a.approvedBy,
    });
    const action = a.type === "RETURN_TO_SUPPLIER" ? "STOCK_RETURN" : a.type === "EXPIRY_WRITEOFF" ? "STOCK_WRITEOFF" : "STOCK_ADJUST";
    await writeAudit(tx, { actorUserId: a.actorUserId, action, entity: "stock_movement", entityId: movementId, ip: a.ip });
    return { movementId, valuePaise: lineValuePaise(Math.abs(a.delta), batch.costPaise) };
  });
}

/** Sends stock back to the supplier. Needs a reason and an admin approver. */
export async function returnToSupplier(input: {
  storeId: string;
  batchId: string;
  quantity: number;
  reason: string;
  actorUserId: string;
  approvedBy: string;
  ip?: string | null;
}) {
  checkQty(input.quantity);
  return moveOneBatch({
    ip: input.ip,
    type: "RETURN_TO_SUPPLIER",
    refType: "RETURN",
    storeId: input.storeId,
    batchId: input.batchId,
    delta: -input.quantity,
    reason: text(input.reason, "Reason", 1, 200),
    actorUserId: input.actorUserId,
    approvedBy: input.approvedBy,
    today: todayIST(),
  });
}

/** Writes off an EXPIRED batch. Needs an admin approver. Reports the rupee value written off. */
export async function writeOff(
  input: { storeId: string; batchId: string; quantity: number; reason?: string | null; actorUserId: string; approvedBy: string; ip?: string | null },
  opts: Opts = {},
) {
  checkQty(input.quantity);
  return moveOneBatch({
    ip: input.ip,
    type: "EXPIRY_WRITEOFF",
    refType: "WRITEOFF",
    storeId: input.storeId,
    batchId: input.batchId,
    delta: -input.quantity,
    reason: input.reason?.trim() ? text(input.reason, "Reason", 1, 200) : "Expired",
    actorUserId: input.actorUserId,
    approvedBy: input.approvedBy,
    requireExpired: true,
    today: opts.today ?? todayIST(),
  });
}

/** Corrects a balance (for example after a stock count). Signed, needs a reason and an admin approver. */
export async function adjust(input: {
  storeId: string;
  batchId: string;
  delta: number;
  reason: string;
  actorUserId: string;
  approvedBy: string;
  ip?: string | null;
}) {
  if (!Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > MAX_QTY)
    throw bad("The adjustment must be a non-zero whole number");
  return moveOneBatch({
    ip: input.ip,
    type: "ADJUSTMENT",
    refType: "ADJUSTMENT",
    storeId: input.storeId,
    batchId: input.batchId,
    delta: input.delta,
    reason: text(input.reason, "Reason", 1, 200),
    actorUserId: input.actorUserId,
    approvedBy: input.approvedBy,
    today: todayIST(),
  });
}

// ---------- indents and stock counts (workflows that move stock) ----------

export type IndentIssueResult = {
  status: "ISSUED" | "PARTIAL";
  issued: { lineId: string; itemId: string; approved: number; issuedNow: number; issuedTotal: number }[];
  picks: Pick[];
};

/**
 * Issues an approved indent: moves the outstanding quantity of every line from the supplying store to the
 * ward (FEFO, as a transfer). If stock is short it issues what exists and the indent becomes PARTIAL.
 * The indent row is locked first, so two people pressing Issue at once cannot issue it twice.
 */
export async function issueIndent(
  input: { indentId: string; actorUserId: string; ip?: string | null },
  opts: Opts = {},
): Promise<IndentIssueResult> {
  const today = opts.today ?? todayIST();
  return run(async (tx) => {
    await lockKeys(tx, [`indent:${input.indentId}`]); // two people pressing Issue at once queue here
    const ind = await tx.indent.findUnique({ where: { id: input.indentId }, select: { id: true, status: true, fromStoreId: true, toStoreId: true, seq: true } });
    if (!ind) throw new StockError("NOT_FOUND", "Indent not found");
    if (!canDo("issue", ind.status as IndentStatus))
      throw new StockError("INVALID_STATE", `Indent #${ind.seq} is ${ind.status.toLowerCase()}, so it cannot be issued`);
    await requireStore(tx, ind.toStoreId, "Supplying store");
    await requireStore(tx, ind.fromStoreId, "Ward");

    const lines = await tx.indentLine.findMany({ where: { indentId: ind.id }, orderBy: { id: "asc" } });
    const todo = lines.filter((l) => outstanding(l) > 0);
    await lockItems(tx, todo.map((l) => l.itemId));

    const picks: Pick[] = [];
    const now = new Map<string, number>();
    const shortages: Record<string, unknown>[] = [];
    for (const l of todo) {
      let want = outstanding(l);
      let [p] = await plan(tx, ind.toStoreId, [{ itemId: l.itemId, quantity: want }], today);
      if (p?.shortage) {
        shortages.push({ itemId: l.itemId, wanted: want, available: p.shortage.available, expired: p.shortage.expired });
        want = p.shortage.available;
        if (want <= 0) continue;
        [p] = await plan(tx, ind.toStoreId, [{ itemId: l.itemId, quantity: want }], today);
      }
      if (!p || p.shortage) continue;
      for (const pick of p.picks) {
        const common = { batchId: pick.batchId, refType: "INDENT", refId: ind.id, actorUserId: input.actorUserId, reason: `Indent #${ind.seq}` };
        await post(tx, { ...common, type: "TRANSFER_OUT", storeId: ind.toStoreId, quantity: -pick.quantity });
        await post(tx, { ...common, type: "TRANSFER_IN", storeId: ind.fromStoreId, quantity: pick.quantity });
        picks.push(pick);
      }
      now.set(l.id, want);
    }
    if (picks.length === 0)
      throw new StockError("INSUFFICIENT_STOCK", "There is no usable stock to issue for this indent", { shortages });

    for (const [lineId, n] of now) await tx.indentLine.update({ where: { id: lineId }, data: { qtyIssued: { increment: n } } });
    const after = lines.map((l) => ({ ...l, qtyIssued: l.qtyIssued + (now.get(l.id) ?? 0) }));
    const status = statusAfterIssue(after);
    await tx.indent.update({ where: { id: ind.id }, data: { status } });
    await writeAudit(tx, { actorUserId: input.actorUserId, action: "INDENT_ISSUE", entity: "indent", entityId: ind.id, ip: input.ip });
    return {
      status,
      picks,
      issued: after
        .filter((l) => (l.qtyApproved ?? 0) > 0)
        .map((l) => ({ lineId: l.id, itemId: l.itemId, approved: l.qtyApproved ?? 0, issuedNow: now.get(l.id) ?? 0, issuedTotal: l.qtyIssued })),
    };
  });
}

/**
 * Approves a submitted stock count: for every counted line it writes an ADJUSTMENT so the balance equals the
 * counted quantity. The adjustment is counted minus the balance AT APPROVAL TIME (not the snapshot taken when
 * the count started), and the reason records both. Needs an active admin as approver. Lines left uncounted
 * are not touched. The count row is locked, so approving twice at once adjusts only once.
 */
export async function applyCount(input: { countId: string; approverId: string; ip?: string | null }) {
  return run(async (tx) => {
    await requireApprover(tx, input.approverId);
    await lockKeys(tx, [`count:${input.countId}`]); // approving twice at once queues here
    const c = await tx.stockCount.findUnique({ where: { id: input.countId }, select: { id: true, status: true, storeId: true, seq: true } });
    if (!c) throw new StockError("NOT_FOUND", "Stock count not found");
    if (c.status !== "SUBMITTED")
      throw new StockError("INVALID_STATE", `Count #${c.seq} is ${c.status.toLowerCase()}, so it cannot be approved`);

    const lines = await tx.stockCountLine.findMany({
      where: { countId: c.id, countedQty: { not: null } },
      include: { batch: { select: { itemId: true } } },
      orderBy: { batchId: "asc" },
    });
    await lockItems(tx, lines.map((l) => l.batch.itemId));

    let adjustments = 0;
    let netUnits = 0;
    for (const l of lines) {
      const bal = await tx.stockBalance.findUnique({ where: { storeId_batchId: { storeId: c.storeId, batchId: l.batchId } }, select: { quantity: true } });
      const current = bal?.quantity ?? 0;
      const counted = l.countedQty ?? 0;
      const delta = counted - current;
      if (delta === 0) continue;
      await post(tx, {
        type: "ADJUSTMENT",
        storeId: c.storeId,
        batchId: l.batchId,
        quantity: delta,
        refType: "COUNT",
        refId: c.id,
        actorUserId: input.approverId,
        approvedBy: input.approverId,
        reason: `Stock count #${c.seq}: counted ${counted}, system ${current}` + (current !== l.systemQty ? ` (was ${l.systemQty} when the count started)` : ""),
      });
      adjustments++;
      netUnits += delta;
    }
    await tx.stockCount.update({ where: { id: c.id }, data: { status: "APPROVED", approvedBy: input.approverId, approvedAt: new Date() } });
    await writeAudit(tx, { actorUserId: input.approverId, action: "STOCK_COUNT_APPROVE", entity: "stock_count", entityId: c.id, ip: input.ip });
    return { adjustments, netUnits, counted: lines.length };
  });
}

// ---------- verification ----------

export type LedgerMismatch = { storeId: string; batchId: string; balance: number; ledger: number };

/**
 * The ledger is the truth: for every store and batch, the sum of movements must equal the balance.
 * Returns the rows where it does not (an empty list means everything matches).
 */
export async function ledgerMismatches(opts: { storeIds?: string[] } = {}): Promise<LedgerMismatch[]> {
  const where = opts.storeIds?.length ? { storeId: { in: opts.storeIds } } : {};
  const [sums, balances] = await Promise.all([
    db.stockMovement.groupBy({ by: ["storeId", "batchId"], where, _sum: { quantity: true } }),
    db.stockBalance.findMany({ where }),
  ]);
  const key = (storeId: string, batchId: string) => `${storeId}|${batchId}`;
  const ledger = new Map(sums.map((x) => [key(x.storeId, x.batchId), x._sum.quantity ?? 0]));
  const held = new Map(balances.map((x) => [key(x.storeId, x.batchId), x.quantity]));
  const out: LedgerMismatch[] = [];
  for (const k of new Set([...ledger.keys(), ...held.keys()])) {
    const l = ledger.get(k) ?? 0;
    const b = held.get(k) ?? 0;
    if (l !== b) {
      const [storeId, batchId] = k.split("|") as [string, string];
      out.push({ storeId, batchId, balance: b, ledger: l });
    }
  }
  return out;
}
