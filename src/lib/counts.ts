// Stock counts: a count sheet per store, a variance report, then admin approval (stock.ts applyCount writes the adjustments).
// Everything here only changes count paperwork, never stock.

import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api-error";
import { writeAudit } from "@/lib/audit";
import { summarizeVariance, lineVariance } from "@/lib/count-variance";
import { db } from "@/lib/db";
import { toDay, todayIST } from "@/lib/fefo";
import type { SessionUser } from "@/lib/session";
import { assertStoreAccess } from "@/lib/store-access";

const MAX_COUNTED = 10_000_000;
const inProgress = (countId?: string) =>
  new ApiError(409, "COUNT_IN_PROGRESS", "A stock count is already in progress for this store. Finish or approve it first.", { countId });
const badState = (seq: number, status: string, doing: string) =>
  new ApiError(409, "INVALID_STATE", `Count #${seq} is ${status.toLowerCase()}, so it cannot be ${doing}.`);

/**
 * Starts a count: snapshots, for the store, every batch that has stock, plus batches that were stocked before
 * and are not expired (their stock may now be zero, but a count can find some on the shelf).
 */
export async function startCount(input: { user: SessionUser; storeId: string; ip?: string | null }) {
  await assertStoreAccess(input.user, input.storeId);
  const store = await db.store.findUnique({ where: { id: input.storeId } });
  if (!store) throw new ApiError(404, "NOT_FOUND", "Store not found.");
  if (!store.active) throw new ApiError(409, "INACTIVE", `Store "${store.name}" is not active.`);
  const existing = await db.stockCount.findFirst({ where: { storeId: input.storeId, status: { in: ["OPEN", "SUBMITTED"] } }, select: { id: true } });
  if (existing) throw inProgress(existing.id);

  const today = todayIST();
  try {
    return await db.$transaction(async (tx) => {
      const c = await tx.stockCount.create({ data: { storeId: input.storeId, startedBy: input.user.id }, select: { id: true, seq: true, status: true } });
      const lines = await tx.$executeRaw`
        INSERT INTO stock_count_line (id, count_id, batch_id, system_qty)
        SELECT gen_random_uuid()::text, ${c.id}, sb.batch_id, sb.quantity
        FROM stock_balance sb JOIN batch b ON b.id = sb.batch_id
        WHERE sb.store_id = ${input.storeId} AND (sb.quantity > 0 OR b.expiry_date >= ${today}::date)`;
      await writeAudit(tx, { actorUserId: input.user.id, action: "STOCK_COUNT_START", entity: "stock_count", entityId: c.id, ip: input.ip });
      return { ...c, lines };
    });
  } catch (e) {
    // two people starting at the same moment: the database allows only one active count per store
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw inProgress();
    throw e;
  }
}

async function loadCount(id: string) {
  const c = await db.stockCount.findUnique({ where: { id } });
  if (!c) throw new ApiError(404, "NOT_FOUND", "Stock count not found.");
  return c;
}

/** Saves counted quantities (null = not counted). Only while the count is OPEN. */
export async function saveCountLines(input: { user: SessionUser; id: string; lines: { lineId: string; countedQty: number | null }[] }) {
  const c = await loadCount(input.id);
  await assertStoreAccess(input.user, c.storeId);
  if (c.status !== "OPEN") throw badState(c.seq, c.status, "edited");
  for (const l of input.lines) {
    if (l.countedQty !== null && (!Number.isInteger(l.countedQty) || l.countedQty < 0 || l.countedQty > MAX_COUNTED))
      throw new ApiError(400, "VALIDATION", `Counted quantities must be whole numbers from 0 to ${MAX_COUNTED.toLocaleString("en-IN")}.`);
  }
  const ids = [...new Set(input.lines.map((l) => l.lineId))];
  if ((await db.stockCountLine.count({ where: { countId: c.id, id: { in: ids } } })) !== ids.length)
    throw new ApiError(400, "VALIDATION", "One of the lines does not belong to this count.");

  await db.$transaction(async (tx) => {
    // re-check inside the transaction: the count may have been submitted while we were validating
    const still = await tx.stockCount.count({ where: { id: c.id, status: "OPEN" } });
    if (!still) throw badState(c.seq, "no longer open", "edited");
    for (const l of input.lines) await tx.stockCountLine.update({ where: { id: l.lineId }, data: { countedQty: l.countedQty } });
  });
  return { id: c.id, saved: input.lines.length };
}

export async function submitCount(input: { user: SessionUser; id: string; ip?: string | null }) {
  const c = await loadCount(input.id);
  await assertStoreAccess(input.user, c.storeId);
  if (c.status !== "OPEN") throw badState(c.seq, c.status, "submitted");
  if ((await db.stockCountLine.count({ where: { countId: c.id, countedQty: { not: null } } })) === 0)
    throw new ApiError(400, "VALIDATION", "Count at least one line before submitting.");
  return db.$transaction(async (tx) => {
    const r = await tx.stockCount.updateMany({ where: { id: c.id, status: "OPEN" }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    if (r.count !== 1) throw badState(c.seq, "no longer open", "submitted");
    await writeAudit(tx, { actorUserId: input.user.id, action: "STOCK_COUNT_SUBMIT", entity: "stock_count", entityId: c.id, ip: input.ip });
    return { id: c.id, status: "SUBMITTED" as const };
  });
}

/** An admin sends a submitted count back to be counted again. */
export async function reopenCount(input: { user: SessionUser; id: string; ip?: string | null }) {
  if (input.user.role !== "ADMIN") throw new ApiError(403, "FORBIDDEN", "Only an admin can send a count back for recounting.");
  const c = await loadCount(input.id);
  return db.$transaction(async (tx) => {
    const r = await tx.stockCount.updateMany({ where: { id: c.id, status: "SUBMITTED" }, data: { status: "OPEN", submittedAt: null } });
    if (r.count !== 1) throw badState(c.seq, c.status, "sent back");
    await writeAudit(tx, { actorUserId: input.user.id, action: "STOCK_COUNT_REOPEN", entity: "stock_count", entityId: c.id, ip: input.ip });
    return { id: c.id, status: "OPEN" as const };
  });
}

/** The count with its lines, current balances, and the variance report. */
export async function getCount(id: string) {
  const c = await db.stockCount.findUnique({
    where: { id },
    include: {
      store: { select: { name: true } },
      starter: { select: { name: true } },
      approver: { select: { name: true } },
      lines: { include: { batch: { include: { item: true } } } },
    },
  });
  if (!c) throw new ApiError(404, "NOT_FOUND", "Stock count not found.");
  const balances = await db.stockBalance.findMany({ where: { storeId: c.storeId, batchId: { in: c.lines.map((l) => l.batchId) } } });
  const current = new Map(balances.map((b) => [b.batchId, b.quantity]));

  const lines = c.lines
    .map((l) => {
      const currentQty = current.get(l.batchId) ?? 0;
      return {
        id: l.id,
        itemId: l.batch.itemId,
        itemName: l.batch.item.name,
        strength: l.batch.item.strength,
        unit: l.batch.item.unit,
        batchId: l.batchId,
        batchNo: l.batch.batchNo,
        expiryDate: toDay(l.batch.expiryDate),
        systemQty: l.systemQty,
        countedQty: l.countedQty,
        currentQty,
        movedSince: currentQty !== l.systemQty,
        costPaise: l.batch.costPaise,
        variance: lineVariance({ systemQty: l.systemQty, countedQty: l.countedQty, costPaise: l.batch.costPaise }),
      };
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName) || a.expiryDate.localeCompare(b.expiryDate) || a.batchNo.localeCompare(b.batchNo));

  return {
    id: c.id,
    seq: c.seq,
    status: c.status,
    storeId: c.storeId,
    storeName: c.store.name,
    startedByName: c.starter.name,
    approvedByName: c.approver?.name ?? null,
    createdAt: c.createdAt,
    submittedAt: c.submittedAt,
    approvedAt: c.approvedAt,
    lines,
    summary: summarizeVariance(lines),
  };
}

export async function listCounts(user: SessionUser) {
  const mine =
    user.role === "ADMIN" || user.role === "AUDITOR"
      ? undefined
      : (await db.userStore.findMany({ where: { userId: user.id }, select: { storeId: true } })).map((s) => s.storeId);
  return db.stockCount.findMany({
    where: mine ? { storeId: { in: mine } } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { store: { select: { name: true } }, starter: { select: { name: true } }, _count: { select: { lines: true } } },
  });
}
