// Indents: a ward asks the store for stock. This file handles the paperwork (create, submit, approve, reject, close).
// Moving the stock when an indent is issued is stock.ts issueIndent, so every stock change stays in one place.
// Each transition is guarded in SQL ("... WHERE status = <expected>"), so two people acting at once cannot both win.

import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api-error";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { nextSeq } from "@/lib/seq";
import { checkApprovals, statusesFor, type IndentAction, type IndentStatus } from "@/lib/indent-flow";
import type { SessionUser } from "@/lib/session";
import { assertStoreAccess } from "@/lib/store-access";

const MAX_LINES = 100;
const MAX_QTY = 100_000;
const invalidState = (seq: number, status: string, doing: string) =>
  new ApiError(409, "INVALID_STATE", `Indent #${seq} is ${status.toLowerCase()}, so it cannot be ${doing}.`);

async function load(id: string) {
  const ind = await db.indent.findUnique({ where: { id }, include: { lines: { orderBy: { id: "asc" } } } });
  if (!ind) throw new ApiError(404, "NOT_FOUND", "Indent not found.");
  return ind;
}

/** Moves the indent from one of the allowed states to the next. Returns false when someone else got there first. */
async function move(tx: Prisma.TransactionClient, id: string, action: IndentAction, to: IndentStatus, data: Prisma.IndentUpdateManyMutationInput = {}) {
  const r = await tx.indent.updateMany({
    where: { id, status: { in: [...statusesFor(action)] } },
    data: { ...data, status: to, updatedAt: new Date() },
  });
  return r.count === 1;
}

export async function createIndent(input: {
  user: SessionUser;
  fromStoreId: string;
  toStoreId: string;
  note?: string | null;
  lines: { itemId: string; quantity: number }[];
  submit?: boolean;
  ip?: string | null;
}) {
  const { user, lines } = input;
  if (!lines.length) throw new ApiError(400, "VALIDATION", "Add at least one item.");
  if (lines.length > MAX_LINES) throw new ApiError(400, "VALIDATION", `At most ${MAX_LINES} items per indent.`);
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QTY)
      throw new ApiError(400, "VALIDATION", `Quantities must be whole numbers from 1 to ${MAX_QTY.toLocaleString("en-IN")}.`);
  }
  if (new Set(lines.map((l) => l.itemId)).size !== lines.length)
    throw new ApiError(400, "VALIDATION", "Each item can appear only once. Change the quantity instead.");
  if (input.fromStoreId === input.toStoreId) throw new ApiError(400, "VALIDATION", "The ward and the supplying store must be different.");
  await assertStoreAccess(user, input.fromStoreId);

  const stores = await db.store.findMany({ where: { id: { in: [input.fromStoreId, input.toStoreId] } } });
  for (const id of [input.fromStoreId, input.toStoreId]) {
    const s = stores.find((x) => x.id === id);
    if (!s) throw new ApiError(404, "NOT_FOUND", "Store not found.");
    if (!s.active) throw new ApiError(409, "INACTIVE", `Store "${s.name}" is not active.`);
  }
  const items = await db.item.findMany({ where: { id: { in: lines.map((l) => l.itemId) } }, select: { id: true, name: true, active: true } });
  for (const l of lines) {
    const it = items.find((i) => i.id === l.itemId);
    if (!it) throw new ApiError(404, "NOT_FOUND", "Item not found.");
    if (!it.active) throw new ApiError(409, "INACTIVE", `Item "${it.name}" is not active.`);
  }
  const note = input.note?.trim() ? input.note.trim().slice(0, 300) : null;

  return db.$transaction(async (tx) => {
    const ind = await tx.indent.create({
      data: {
        seq: await nextSeq(tx, "indent"),
        fromStoreId: input.fromStoreId,
        toStoreId: input.toStoreId,
        createdBy: user.id,
        note,
        status: input.submit ? "SUBMITTED" : "DRAFT",
        lines: { create: lines.map((l) => ({ itemId: l.itemId, qtyRequested: l.quantity })) },
      },
      select: { id: true, seq: true, status: true },
    });
    await writeAudit(tx, { actorUserId: user.id, action: input.submit ? "INDENT_CREATE_SUBMIT" : "INDENT_CREATE", entity: "indent", entityId: ind.id, ip: input.ip });
    return ind;
  });
}

export async function submitIndent(input: { user: SessionUser; id: string; ip?: string | null }) {
  const ind = await load(input.id);
  await assertStoreAccess(input.user, ind.fromStoreId);
  return db.$transaction(async (tx) => {
    if (!(await move(tx, ind.id, "submit", "SUBMITTED"))) throw invalidState(ind.seq, (await tx.indent.findUnique({ where: { id: ind.id } }))?.status ?? ind.status, "submitted");
    await writeAudit(tx, { actorUserId: input.user.id, action: "INDENT_SUBMIT", entity: "indent", entityId: ind.id, ip: input.ip });
    return { id: ind.id, status: "SUBMITTED" as const };
  });
}

export async function approveIndent(input: {
  user: SessionUser;
  id: string;
  approvals?: { lineId: string; qtyApproved: number }[];
  note?: string | null;
  ip?: string | null;
}) {
  const ind = await load(input.id);
  await assertStoreAccess(input.user, ind.toStoreId);
  const check = checkApprovals(ind.lines, input.approvals);
  if (!check.ok) throw new ApiError(400, "VALIDATION", check.message);
  const note = input.note?.trim() ? input.note.trim().slice(0, 300) : null;

  return db.$transaction(async (tx) => {
    if (!(await move(tx, ind.id, "approve", "APPROVED", { decisionNote: note })))
      throw invalidState(ind.seq, (await tx.indent.findUnique({ where: { id: ind.id } }))?.status ?? ind.status, "approved");
    for (const [lineId, qty] of check.approved) await tx.indentLine.update({ where: { id: lineId }, data: { qtyApproved: qty } });
    await writeAudit(tx, { actorUserId: input.user.id, action: "INDENT_APPROVE", entity: "indent", entityId: ind.id, ip: input.ip });
    return { id: ind.id, status: "APPROVED" as const };
  });
}

export async function rejectIndent(input: { user: SessionUser; id: string; note: string; ip?: string | null }) {
  const note = input.note?.trim();
  if (!note) throw new ApiError(400, "VALIDATION", "Give a reason for rejecting the indent.");
  const ind = await load(input.id);
  await assertStoreAccess(input.user, ind.toStoreId);
  return db.$transaction(async (tx) => {
    if (!(await move(tx, ind.id, "reject", "REJECTED", { decisionNote: note.slice(0, 300) })))
      throw invalidState(ind.seq, (await tx.indent.findUnique({ where: { id: ind.id } }))?.status ?? ind.status, "rejected");
    await writeAudit(tx, { actorUserId: input.user.id, action: "INDENT_REJECT", entity: "indent", entityId: ind.id, ip: input.ip });
    return { id: ind.id, status: "REJECTED" as const };
  });
}

/** Ends a partly issued indent: nothing more will be sent for the lines still outstanding. */
export async function closeIndent(input: { user: SessionUser; id: string; note?: string | null; ip?: string | null }) {
  const ind = await load(input.id);
  await assertStoreAccess(input.user, ind.toStoreId);
  const note = input.note?.trim() ? input.note.trim().slice(0, 300) : null;
  return db.$transaction(async (tx) => {
    if (!(await move(tx, ind.id, "close", "ISSUED", { decisionNote: note })))
      throw invalidState(ind.seq, (await tx.indent.findUnique({ where: { id: ind.id } }))?.status ?? ind.status, "closed");
    await writeAudit(tx, { actorUserId: input.user.id, action: "INDENT_CLOSE", entity: "indent", entityId: ind.id, ip: input.ip });
    return { id: ind.id, status: "ISSUED" as const };
  });
}

/** What the user is allowed to see: a ward sees its own indents, a store sees those sent to it, admin and auditor see all. */
async function visibility(user: SessionUser): Promise<Prisma.IndentWhereInput> {
  if (user.role === "ADMIN" || user.role === "AUDITOR") return {};
  const mine = (await db.userStore.findMany({ where: { userId: user.id }, select: { storeId: true } })).map((s) => s.storeId);
  if (user.role === "NURSE") return { fromStoreId: { in: mine } };
  if (user.role === "STOREKEEPER") return { toStoreId: { in: mine } };
  return { id: "none" };
}

export async function listIndents(input: { user: SessionUser; status?: IndentStatus; limit?: number }) {
  return db.indent.findMany({
    where: { ...(await visibility(input.user)), ...(input.status ? { status: input.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 100, 300),
    include: {
      fromStore: { select: { name: true } },
      toStore: { select: { name: true } },
      creator: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });
}

/** One indent with its lines, if the user may see it. */
export async function getIndent(user: SessionUser, id: string) {
  const ind = await db.indent.findFirst({
    where: { id, ...(await visibility(user)) },
    include: {
      fromStore: { select: { id: true, name: true } },
      toStore: { select: { id: true, name: true } },
      creator: { select: { name: true } },
      lines: { orderBy: { item: { name: "asc" } }, include: { item: { select: { id: true, name: true, strength: true, unit: true } } } },
    },
  });
  if (!ind) throw new ApiError(404, "NOT_FOUND", "Indent not found.");
  return ind;
}
