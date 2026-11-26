import { afterAll, describe, expect, it } from "vitest";
import { getExpiryList, getLowStock } from "@/lib/alerts";
import { applyCount, issueIndent, ledgerMismatches, receive } from "@/lib/stock";
import { createIndent, approveIndent, closeIndent, rejectIndent, submitIndent } from "@/lib/indents";
import { getCount, reopenCount, saveCountLines, startCount, submitCount } from "@/lib/counts";
import { getDashboard } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/fefo";

// ---------- helpers ----------
let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TODAY = todayIST();
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const LONG_AGO = addDays(TODAY, -400);

type U = { id: string; name: string; role: "ADMIN" | "STOREKEEPER" | "NURSE" | "PHARMACIST" | "AUDITOR" };

async function world() {
  const mk = (role: U["role"]) => db.user.create({ data: { name: role, phone: uid(), passwordHash: "x", role } });
  const [admin, keeper, nurse, nurseB] = await Promise.all([mk("ADMIN"), mk("STOREKEEPER"), mk("NURSE"), mk("NURSE")]);
  const store = (type: "MAIN" | "WARD", n: string) => db.store.create({ data: { name: `${n}-${uid()}`, type } });
  const [main, wardA, wardB, other] = await Promise.all([store("MAIN", "Main"), store("WARD", "WardA"), store("WARD", "WardB"), store("MAIN", "Other")]);
  await db.userStore.createMany({
    data: [
      { userId: keeper.id, storeId: main.id },
      { userId: nurse.id, storeId: wardA.id },
      { userId: nurseB.id, storeId: wardB.id },
    ],
  });
  const supplier = await db.supplier.create({ data: { name: `Sup-${uid()}` } });
  const item = (levels: Partial<{ minLevel: number; reorderLevel: number; maxLevel: number; active: boolean }> = {}) =>
    db.item.create({ data: { name: `Item-${uid()}`, form: "TABLET", unit: "tablet", ...levels } });
  const [i1, i2] = await Promise.all([item(), item()]);
  const asU = (u: { id: string; name: string; role: string }) => u as U;
  return { admin: asU(admin), keeper: asU(keeper), nurse: asU(nurse), nurseB: asU(nurseB), main, wardA, wardB, other, supplier, i1, i2, item };
}
type W = Awaited<ReturnType<typeof world>>;

async function recv(w: W, o: { store?: string; item: string; batchNo: string; expiry: string; qty: number; today?: string; cost?: number }) {
  return receive(
    {
      storeId: o.store ?? w.main.id,
      supplierId: w.supplier.id,
      invoiceNo: `INV-${uid()}`,
      invoiceDate: TODAY,
      actorUserId: w.keeper.id,
      lines: [{ itemId: o.item, batchNo: o.batchNo, expiryDate: o.expiry, quantity: o.qty, mrpPaise: 500, costPaise: o.cost ?? 100 }],
    },
    o.today ? { today: o.today } : undefined,
  );
}
const batchId = async (itemId: string, batchNo: string) => (await db.batch.findUniqueOrThrow({ where: { itemId_batchNo: { itemId, batchNo } } })).id;
const bal = async (storeId: string, bId: string) => (await db.stockBalance.findUnique({ where: { storeId_batchId: { storeId, batchId: bId } } }))?.quantity ?? 0;
const onHandItem = async (storeId: string, itemId: string) =>
  (await db.stockBalance.findMany({ where: { storeId, batch: { itemId } } })).reduce((s, b) => s + b.quantity, 0);
const noMismatch = async (...ids: string[]) => expect(await ledgerMismatches({ storeIds: ids })).toEqual([]);

afterAll(() => db.$disconnect());

// ---------- indents ----------
describe("indents", () => {
  async function stocked() {
    const w = await world();
    await recv(w, { item: w.i1.id, batchNo: "A", expiry: addDays(TODAY, 100), qty: 30 });
    await recv(w, { item: w.i2.id, batchNo: "B", expiry: addDays(TODAY, 100), qty: 5 });
    return w;
  }
  const raise = (w: W, lines: { itemId: string; quantity: number }[], extra: { submit?: boolean; note?: string } = {}) =>
    createIndent({ user: w.nurse, fromStoreId: w.wardA.id, toStoreId: w.main.id, lines, ...extra });
  const lineOf = async (indentId: string, itemId: string) => db.indentLine.findFirstOrThrow({ where: { indentId, itemId } });
  const issue = (w: W, id: string) => issueIndent({ indentId: id, actorUserId: w.keeper.id });

  it("creates a draft, then submits it", async () => {
    const w = await stocked();
    const ind = await raise(w, [{ itemId: w.i1.id, quantity: 12 }], { note: "Night shift" });
    expect(ind).toMatchObject({ status: "DRAFT", seq: expect.any(Number) });
    expect(await db.indent.findUniqueOrThrow({ where: { id: ind.id } })).toMatchObject({ note: "Night shift", fromStoreId: w.wardA.id, toStoreId: w.main.id, createdBy: w.nurse.id });
    expect(await submitIndent({ user: w.nurse, id: ind.id })).toMatchObject({ status: "SUBMITTED" });
    const withSubmit = await raise(w, [{ itemId: w.i1.id, quantity: 1 }], { submit: true });
    expect(withSubmit.status).toBe("SUBMITTED");
  });

  it("validates the request", async () => {
    const w = await stocked();
    await expect(raise(w, [])).rejects.toMatchObject({ status: 400 });
    await expect(raise(w, [{ itemId: w.i1.id, quantity: 0 }])).rejects.toMatchObject({ status: 400 });
    await expect(raise(w, [{ itemId: w.i1.id, quantity: 1.5 }])).rejects.toMatchObject({ status: 400 });
    await expect(raise(w, [{ itemId: w.i1.id, quantity: 1 }, { itemId: w.i1.id, quantity: 2 }])).rejects.toMatchObject({ status: 400 });
    await expect(createIndent({ user: w.nurse, fromStoreId: w.wardA.id, toStoreId: w.wardA.id, lines: [{ itemId: w.i1.id, quantity: 1 }] })).rejects.toMatchObject({ status: 400 });
    await expect(raise(w, [{ itemId: "nope", quantity: 1 }])).rejects.toMatchObject({ status: 404 });
    const inactive = await w.item({ active: false });
    await expect(raise(w, [{ itemId: inactive.id, quantity: 1 }])).rejects.toMatchObject({ status: 409 });
  });

  it("a nurse can only raise and submit indents for her own ward", async () => {
    const w = await stocked();
    await expect(createIndent({ user: w.nurse, fromStoreId: w.wardB.id, toStoreId: w.main.id, lines: [{ itemId: w.i1.id, quantity: 1 }] })).rejects.toMatchObject({ code: "STORE_FORBIDDEN" });
    const ind = await raise(w, [{ itemId: w.i1.id, quantity: 1 }]);
    await expect(submitIndent({ user: w.nurseB, id: ind.id })).rejects.toMatchObject({ code: "STORE_FORBIDDEN" });
  });

  it("full flow: submit, approve everything, issue: the stock moves to the ward through the ledger", async () => {
    const w = await stocked();
    const ind = await raise(w, [{ itemId: w.i1.id, quantity: 12 }, { itemId: w.i2.id, quantity: 3 }], { submit: true });
    expect(await approveIndent({ user: w.keeper, id: ind.id })).toMatchObject({ status: "APPROVED" });
    expect((await lineOf(ind.id, w.i1.id)).qtyApproved).toBe(12);
    const r = await issue(w, ind.id);
    expect(r.status).toBe("ISSUED");
    expect(await bal(w.main.id, await batchId(w.i1.id, "A"))).toBe(18);
    expect(await bal(w.wardA.id, await batchId(w.i1.id, "A"))).toBe(12);
    expect(await bal(w.wardA.id, await batchId(w.i2.id, "B"))).toBe(3);
    expect((await lineOf(ind.id, w.i1.id)).qtyIssued).toBe(12);
    const ms = await db.stockMovement.findMany({ where: { refId: ind.id } });
    expect(new Set(ms.map((m) => m.type))).toEqual(new Set(["TRANSFER_OUT", "TRANSFER_IN"]));
    expect(ms.every((m) => m.refType === "INDENT")).toBe(true);
    await noMismatch(w.main.id, w.wardA.id);
    await expect(issue(w, ind.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("the store can approve less than was requested, or nothing for one line", async () => {
    const w = await stocked();
    const ind = await raise(w, [{ itemId: w.i1.id, quantity: 20 }, { itemId: w.i2.id, quantity: 4 }], { submit: true });
    const l1 = await lineOf(ind.id, w.i1.id), l2 = await lineOf(ind.id, w.i2.id);
    await expect(approveIndent({ user: w.keeper, id: ind.id, approvals: [{ lineId: l1.id, qtyApproved: 21 }] })).rejects.toMatchObject({ status: 400 });
    await expect(approveIndent({ user: w.keeper, id: ind.id, approvals: [{ lineId: l1.id, qtyApproved: 0 }, { lineId: l2.id, qtyApproved: 0 }] })).rejects.toMatchObject({ status: 400 });
    await approveIndent({ user: w.keeper, id: ind.id, approvals: [{ lineId: l1.id, qtyApproved: 10 }, { lineId: l2.id, qtyApproved: 0 }] });
    expect((await issue(w, ind.id)).status).toBe("ISSUED");
    expect(await onHandItem(w.wardA.id, w.i1.id)).toBe(10);
    expect(await onHandItem(w.wardA.id, w.i2.id)).toBe(0);
  });

  it("when stock is short it issues what exists, stays PARTIAL, and can be issued again later", async () => {
    const w = await stocked(); // i2 has only 5
    const ind = await raise(w, [{ itemId: w.i2.id, quantity: 8 }, { itemId: w.i1.id, quantity: 2 }], { submit: true });
    await approveIndent({ user: w.keeper, id: ind.id });
    const first = await issue(w, ind.id);
    expect(first.status).toBe("PARTIAL");
    expect(first.issued.find((l) => l.itemId === w.i2.id)).toMatchObject({ issuedNow: 5, issuedTotal: 5, approved: 8 });
    expect(await onHandItem(w.wardA.id, w.i2.id)).toBe(5);
    // nothing left of i2 and nothing else outstanding to give: refused, and nothing changes
    await expect(issue(w, ind.id)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect((await db.indent.findUniqueOrThrow({ where: { id: ind.id } })).status).toBe("PARTIAL");
    // more arrives, issue the rest
    await recv(w, { item: w.i2.id, batchNo: "B2", expiry: addDays(TODAY, 200), qty: 10 });
    const second = await issue(w, ind.id);
    expect(second.status).toBe("ISSUED");
    expect(await onHandItem(w.wardA.id, w.i2.id)).toBe(8);
    await noMismatch(w.main.id, w.wardA.id);
  });

  it("expired stock is never issued to a ward", async () => {
    const w = await world();
    await recv(w, { item: w.i1.id, batchNo: "OLD", expiry: addDays(TODAY, -5), qty: 9, today: LONG_AGO });
    const ind = await raise(w, [{ itemId: w.i1.id, quantity: 3 }], { submit: true });
    await approveIndent({ user: w.keeper, id: ind.id });
    await expect(issue(w, ind.id)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await onHandItem(w.wardA.id, w.i1.id)).toBe(0);
  });

  it("a partly issued indent can be closed, which ends it", async () => {
    const w = await stocked();
    const ind = await raise(w, [{ itemId: w.i2.id, quantity: 8 }], { submit: true });
    await approveIndent({ user: w.keeper, id: ind.id });
    await issue(w, ind.id);
    await expect(closeIndent({ user: w.nurse, id: ind.id })).rejects.toMatchObject({ code: "STORE_FORBIDDEN" });
    expect(await closeIndent({ user: w.keeper, id: ind.id, note: "Supplier out of stock" })).toMatchObject({ status: "ISSUED" });
    expect((await db.indent.findUniqueOrThrow({ where: { id: ind.id } })).decisionNote).toBe("Supplier out of stock");
    await expect(issue(w, ind.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("can only close an indent that is PARTIAL", async () => {
    const w = await stocked();
    const ind = await raise(w, [{ itemId: w.i1.id, quantity: 2 }], { submit: true });
    await expect(closeIndent({ user: w.keeper, id: ind.id })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("reject needs a reason, ends the indent, and nothing can happen afterwards", async () => {
    const w = await stocked();
    const ind = await raise(w, [{ itemId: w.i1.id, quantity: 2 }], { submit: true });
    await expect(rejectIndent({ user: w.keeper, id: ind.id, note: " " })).rejects.toMatchObject({ status: 400 });
    expect(await rejectIndent({ user: w.keeper, id: ind.id, note: "Not needed this week" })).toMatchObject({ status: "REJECTED" });
    await expect(approveIndent({ user: w.keeper, id: ind.id })).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(issue(w, ind.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(submitIndent({ user: w.nurse, id: ind.id })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("only a storekeeper assigned to the supplying store can decide", async () => {
    const w = await stocked();
    const otherKeeper = await db.user.create({ data: { name: "K2", phone: uid(), passwordHash: "x", role: "STOREKEEPER" } });
    await db.userStore.create({ data: { userId: otherKeeper.id, storeId: w.other.id } });
    const ind = await raise(w, [{ itemId: w.i1.id, quantity: 2 }], { submit: true });
    await expect(approveIndent({ user: otherKeeper as U, id: ind.id })).rejects.toMatchObject({ code: "STORE_FORBIDDEN" });
    await expect(rejectIndent({ user: otherKeeper as U, id: ind.id, note: "x" })).rejects.toMatchObject({ code: "STORE_FORBIDDEN" });
  });

  it("two storekeepers pressing Issue at once issue the indent only once", async () => {
    const w = await stocked();
    const ind = await raise(w, [{ itemId: w.i1.id, quantity: 10 }], { submit: true });
    await approveIndent({ user: w.keeper, id: ind.id });
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => issue(w, ind.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "INVALID_STATE" });
    expect(await onHandItem(w.wardA.id, w.i1.id)).toBe(10);
    expect(await onHandItem(w.main.id, w.i1.id)).toBe(20);
    await noMismatch(w.main.id, w.wardA.id);
  });

  it("parallel issues against short stock never give out more than exists", async () => {
    const w = await stocked(); // i2: 5 in stock
    const ind = await raise(w, [{ itemId: w.i2.id, quantity: 8 }], { submit: true });
    await approveIndent({ user: w.keeper, id: ind.id });
    await Promise.allSettled(Array.from({ length: 6 }, () => issue(w, ind.id)));
    expect(await onHandItem(w.wardA.id, w.i2.id)).toBe(5);
    expect(await onHandItem(w.main.id, w.i2.id)).toBe(0);
    expect((await lineOf(ind.id, w.i2.id)).qtyIssued).toBe(5);
    await noMismatch(w.main.id, w.wardA.id);
  });

  it("two people approving at once: one wins, the other is told it is already decided", async () => {
    const w = await stocked();
    const ind = await raise(w, [{ itemId: w.i1.id, quantity: 2 }], { submit: true });
    const r = await Promise.allSettled([approveIndent({ user: w.keeper, id: ind.id }), rejectIndent({ user: w.keeper, id: ind.id, note: "no" })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "INVALID_STATE" });
  });
});

// ---------- stock counts ----------
describe("stock counts", () => {
  async function counted() {
    const w = await world();
    await recv(w, { item: w.i1.id, batchNo: "A", expiry: addDays(TODAY, 100), qty: 10 });
    await recv(w, { item: w.i2.id, batchNo: "B", expiry: addDays(TODAY, 100), qty: 4 });
    // OLD is expired but still has stock on the books, so it is on the count sheet too
    await recv(w, { item: w.i1.id, batchNo: "OLD", expiry: addDays(TODAY, -3), qty: 4, today: LONG_AGO });
    return w;
  }
  const lines = async (countId: string) => db.stockCountLine.findMany({ where: { countId }, include: { batch: true }, orderBy: { batch: { batchNo: "asc" } } });
  const line = async (countId: string, batchNo: string) => (await lines(countId)).find((l) => l.batch.batchNo === batchNo)!;

  it("starts a count with a snapshot of every batch with stock in the store", async () => {
    const w = await counted();
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    expect(c).toMatchObject({ status: "OPEN", lines: 3 });
    const ls = await lines(c.id);
    expect(ls.map((l) => [l.batch.batchNo, l.systemQty, l.countedQty])).toEqual([["A", 10, null], ["B", 4, null], ["OLD", 4, null]]);
  });

  it("includes a batch whose stock has gone to zero but is not expired (so found stock can be counted)", async () => {
    const w = await counted();
    const { issue } = await import("@/lib/stock");
    await issue({ storeId: w.main.id, reason: "r", actorUserId: w.keeper.id, lines: [{ itemId: w.i2.id, quantity: 4 }] });
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    expect((await line(c.id, "B")).systemQty).toBe(0);
  });

  it("allows only one count in progress per store", async () => {
    const w = await counted();
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    await expect(startCount({ user: w.admin, storeId: w.main.id })).rejects.toMatchObject({ status: 409, code: "COUNT_IN_PROGRESS" });
    const racers = await Promise.allSettled(Array.from({ length: 5 }, () => startCount({ user: w.admin, storeId: w.other.id })));
    expect(racers.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: (await line(c.id, "A")).id, countedQty: 10 }] });
    await submitCount({ user: w.keeper, id: c.id });
    await expect(startCount({ user: w.keeper, storeId: w.main.id })).rejects.toMatchObject({ code: "COUNT_IN_PROGRESS" }); // SUBMITTED still counts as in progress
  });

  it("a keeper can only count in his own store", async () => {
    const w = await counted();
    await expect(startCount({ user: w.keeper, storeId: w.other.id })).rejects.toMatchObject({ code: "STORE_FORBIDDEN" });
  });

  it("saves counted quantities, validates them, and refuses lines from another count", async () => {
    const w = await counted();
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    const a = await line(c.id, "A");
    await saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: a.id, countedQty: 7 }] });
    expect((await line(c.id, "A")).countedQty).toBe(7);
    await saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: a.id, countedQty: null }] }); // un-count
    expect((await line(c.id, "A")).countedQty).toBeNull();
    await expect(saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: a.id, countedQty: -1 }] })).rejects.toMatchObject({ status: 400 });
    await expect(saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: a.id, countedQty: 1.5 }] })).rejects.toMatchObject({ status: 400 });
    await expect(saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: "nope", countedQty: 1 }] })).rejects.toMatchObject({ status: 400 });
  });

  it("submitting needs at least one counted line, and locks the sheet", async () => {
    const w = await counted();
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    await expect(submitCount({ user: w.keeper, id: c.id })).rejects.toMatchObject({ status: 400 });
    const a = await line(c.id, "A");
    await saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: a.id, countedQty: 10 }] });
    expect(await submitCount({ user: w.keeper, id: c.id })).toMatchObject({ status: "SUBMITTED" });
    await expect(saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: a.id, countedQty: 9 }] })).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(submitCount({ user: w.keeper, id: c.id })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("approval turns variances into ADJUSTMENT movements so the books match the shelf", async () => {
    const w = await counted();
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    const A = await line(c.id, "A"), B = await line(c.id, "B"), OLD = await line(c.id, "OLD");
    await saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: A.id, countedQty: 8 }, { lineId: B.id, countedQty: 6 }] }); // A short 2, B over 2, OLD not counted
    await submitCount({ user: w.keeper, id: c.id });

    const r = await applyCount({ countId: c.id, approverId: w.admin.id });
    expect(r).toMatchObject({ adjustments: 2, netUnits: 0 });
    expect(await bal(w.main.id, A.batchId)).toBe(8);
    expect(await bal(w.main.id, B.batchId)).toBe(6);
    expect(await bal(w.main.id, OLD.batchId)).toBe(4); // not counted: untouched
    const ms = await db.stockMovement.findMany({ where: { refId: c.id }, orderBy: { seq: "asc" } });
    expect(ms.map((m) => [m.type, m.quantity])).toEqual([["ADJUSTMENT", -2], ["ADJUSTMENT", 2]]);
    for (const m of ms) expect(m).toMatchObject({ refType: "COUNT", approvedBy: w.admin.id, actorUserId: w.admin.id });
    expect(ms[0]!.reason).toMatch(/count/i);
    expect(await db.stockCount.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: "APPROVED", approvedBy: w.admin.id, approvedAt: expect.any(Date) });
    await noMismatch(w.main.id);
    // the store is free for a new count afterwards
    await expect(startCount({ user: w.keeper, storeId: w.main.id })).resolves.toMatchObject({ status: "OPEN" });
  });

  it("counting zero against stock writes off the whole shortage", async () => {
    const w = await counted();
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    const A = await line(c.id, "A");
    await saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: A.id, countedQty: 0 }] });
    await submitCount({ user: w.keeper, id: c.id });
    await applyCount({ countId: c.id, approverId: w.admin.id });
    expect(await bal(w.main.id, A.batchId)).toBe(0);
    await noMismatch(w.main.id);
  });

  it("flags lines that moved during the count, and adjusts relative to the stock at approval time", async () => {
    const w = await counted();
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    const A = await line(c.id, "A");
    const { issue } = await import("@/lib/stock");
    await issue({ storeId: w.main.id, reason: "ward", actorUserId: w.keeper.id, lines: [{ itemId: w.i1.id, quantity: 1 }] }); // A: 10 -> 9 (OLD is expired, untouched)
    await saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: A.id, countedQty: 8 }] });
    await submitCount({ user: w.keeper, id: c.id });
    const view = await getCount(c.id);
    expect(view.lines.find((l) => l.batchNo === "A")).toMatchObject({ systemQty: 10, currentQty: 9, movedSince: true, countedQty: 8 });
    expect(view.summary).toMatchObject({ counted: 1, short: 1 });
    await applyCount({ countId: c.id, approverId: w.admin.id });
    expect(await bal(w.main.id, A.batchId)).toBe(8);
    const adj = (await db.stockMovement.findMany({ where: { refId: c.id } }))[0]!;
    expect(adj.quantity).toBe(-1); // 8 counted vs 9 on the books at approval
    expect(adj.reason).toMatch(/10/); // the reason records the snapshot figure too
  });

  it("only an active admin can approve, and only a submitted count", async () => {
    const w = await counted();
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    await expect(applyCount({ countId: c.id, approverId: w.admin.id })).rejects.toMatchObject({ code: "INVALID_STATE" }); // still OPEN
    await saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: (await line(c.id, "A")).id, countedQty: 1 }] });
    await submitCount({ user: w.keeper, id: c.id });
    await expect(applyCount({ countId: c.id, approverId: w.keeper.id })).rejects.toMatchObject({ code: "APPROVER_REQUIRED" });
    await expect(applyCount({ countId: "nope", approverId: w.admin.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("two admins approving at once adjust the stock only once", async () => {
    const w = await counted();
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    await saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: (await line(c.id, "A")).id, countedQty: 3 }] });
    await submitCount({ user: w.keeper, id: c.id });
    const r = await Promise.allSettled(Array.from({ length: 5 }, () => applyCount({ countId: c.id, approverId: w.admin.id })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await bal(w.main.id, (await line(c.id, "A")).batchId)).toBe(3);
    expect(await db.stockMovement.count({ where: { refId: c.id } })).toBe(1);
    await noMismatch(w.main.id);
  });

  it("an admin can send a submitted count back for a recount; nobody else can, and not after approval", async () => {
    const w = await counted();
    const c = await startCount({ user: w.keeper, storeId: w.main.id });
    await saveCountLines({ user: w.keeper, id: c.id, lines: [{ lineId: (await line(c.id, "A")).id, countedQty: 5 }] });
    await submitCount({ user: w.keeper, id: c.id });
    await expect(reopenCount({ user: w.keeper, id: c.id })).rejects.toMatchObject({ status: 403 });
    expect(await reopenCount({ user: w.admin, id: c.id })).toMatchObject({ status: "OPEN" });
    await submitCount({ user: w.keeper, id: c.id });
    await applyCount({ countId: c.id, approverId: w.admin.id });
    await expect(reopenCount({ user: w.admin, id: c.id })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

// ---------- expiry centre and low stock ----------
describe("alerts", () => {
  it("the expiry list shows expired and near-expiry stock by band with rupee values, and nothing else", async () => {
    const w = await world();
    const it = await w.item();
    await recv(w, { item: it.id, batchNo: "EXP", expiry: addDays(TODAY, -3), qty: 4, cost: 250, today: LONG_AGO });
    await recv(w, { item: it.id, batchNo: "D10", expiry: addDays(TODAY, 10), qty: 2, cost: 100 });
    await recv(w, { item: it.id, batchNo: "D45", expiry: addDays(TODAY, 45), qty: 3, cost: 100 });
    await recv(w, { item: it.id, batchNo: "D80", expiry: addDays(TODAY, 80), qty: 1, cost: 1000 });
    await recv(w, { item: it.id, batchNo: "D200", expiry: addDays(TODAY, 200), qty: 9, cost: 100 });
    await recv(w, { item: it.id, batchNo: "EMPTY", expiry: addDays(TODAY, 5), qty: 1, cost: 100 });
    const { issue } = await import("@/lib/stock");
    await issue({ storeId: w.main.id, reason: "r", actorUserId: w.keeper.id, lines: [{ itemId: it.id, quantity: 1, batchId: await batchId(it.id, "EMPTY"), overrideReason: "empty it" }] });

    const r = await getExpiryList({});
    const mine = r.rows.filter((x) => x.itemId === it.id);
    expect(mine.map((x) => [x.batchNo, x.band, x.daysLeft, x.quantity, x.valuePaise]).sort()).toEqual(
      [
        ["D10", "d30", 10, 2, 200],
        ["D45", "d60", 45, 3, 300],
        ["D80", "d90", 80, 1, 1000],
        ["EXP", "expired", -3, 4, 1000],
      ].sort(),
    );
    expect(r.bands.map((b) => b.key)).toEqual(["expired", "d30", "d60", "d90"]);
    expect(r.summary.find((s) => s.key === "expired")!.valuePaise).toBeGreaterThanOrEqual(1000);
  });

  it("can be limited to one store, and a different 'today' shifts the bands", async () => {
    const w = await world();
    const it = await w.item();
    await recv(w, { item: it.id, batchNo: "M", expiry: addDays(TODAY, 20), qty: 2 });
    await recv(w, { item: it.id, batchNo: "O", expiry: addDays(TODAY, 20), qty: 3, store: w.other.id });
    const main = (await getExpiryList({ storeId: w.main.id })).rows.filter((x) => x.itemId === it.id);
    expect(main.map((x) => x.batchNo)).toEqual(["M"]);
    const later = (await getExpiryList({ storeId: w.main.id, today: addDays(TODAY, 25) })).rows.filter((x) => x.itemId === it.id);
    expect(later[0]).toMatchObject({ band: "expired", daysLeft: -5 });
  });

  it("the low-stock list counts only usable stock, suggests max minus on-hand, and flags stock-outs", async () => {
    const w = await world();
    const low = await w.item({ minLevel: 20, reorderLevel: 50, maxLevel: 200 });
    const out = await w.item({ reorderLevel: 10, maxLevel: 40 });
    const fine = await w.item({ reorderLevel: 5 });
    const untracked = await w.item();
    const inactive = await w.item({ reorderLevel: 10, active: false });
    await recv(w, { item: low.id, batchNo: "L1", expiry: addDays(TODAY, 100), qty: 30 });
    await recv(w, { item: low.id, batchNo: "LX", expiry: addDays(TODAY, -2), qty: 20, today: LONG_AGO }); // expired: not counted
    await recv(w, { item: fine.id, batchNo: "F1", expiry: addDays(TODAY, 100), qty: 5 }); // equals reorder level: not low
    await recv(w, { item: untracked.id, batchNo: "U1", expiry: addDays(TODAY, 100), qty: 1 });

    const rows = await getLowStock({});
    const byId = new Map(rows.map((r) => [r.itemId, r]));
    expect(byId.get(low.id)).toMatchObject({ onHand: 30, expiredQty: 20, status: "LOW", belowMin: false, suggested: 170, target: 200 });
    expect(byId.get(out.id)).toMatchObject({ onHand: 0, status: "OUT", suggested: 40 });
    expect(byId.has(fine.id)).toBe(false);
    expect(byId.has(untracked.id)).toBe(false);
    expect(byId.has(inactive.id)).toBe(false);
  });

  it("the low-stock list for one store looks only at that store", async () => {
    const w = await world();
    const it = await w.item({ reorderLevel: 20, maxLevel: 100 });
    await recv(w, { item: it.id, batchNo: "A", expiry: addDays(TODAY, 100), qty: 50 });
    await recv(w, { item: it.id, batchNo: "B", expiry: addDays(TODAY, 100), qty: 5, store: w.other.id });
    expect((await getLowStock({})).some((r) => r.itemId === it.id)).toBe(false); // 55 in total
    const forOther = (await getLowStock({ storeId: w.other.id })).find((r) => r.itemId === it.id);
    expect(forOther).toMatchObject({ onHand: 5, status: "LOW", suggested: 95 });
  });
});

// ---------- dashboard ----------
describe("dashboard", () => {
  it("summarises expired and near-expiry value, low stock, stock-outs, pending work and recent movements", async () => {
    const w = await world();
    const it = await w.item({ reorderLevel: 100, maxLevel: 300 });
    await recv(w, { item: it.id, batchNo: "EXP", expiry: addDays(TODAY, -1), qty: 10, cost: 500, today: LONG_AGO });
    await recv(w, { item: it.id, batchNo: "SOON", expiry: addDays(TODAY, 15), qty: 4, cost: 500 });
    const ind = await createIndent({ user: w.nurse, fromStoreId: w.wardA.id, toStoreId: w.main.id, lines: [{ itemId: it.id, quantity: 1 }], submit: true });
    const c = await startCount({ user: w.keeper, storeId: w.main.id });

    const d = await getDashboard();
    expect(d.today).toBe(TODAY);
    expect(d.expired.valuePaise).toBeGreaterThanOrEqual(5000);
    expect(d.expired.count).toBeGreaterThanOrEqual(1);
    expect(d.bands.map((b) => b.key)).toEqual(["d30", "d60", "d90"]);
    expect(d.bands[0]!.valuePaise).toBeGreaterThanOrEqual(2000);
    expect(d.lowStockCount).toBeGreaterThanOrEqual(1); // our item: 4 usable vs reorder level 100
    expect(d.pendingIndents).toBeGreaterThanOrEqual(1);
    expect(d.openCounts).toBeGreaterThanOrEqual(1);
    expect(d.recent.length).toBeGreaterThan(0);
    expect(d.recent[0]).toMatchObject({ itemName: expect.any(String), type: expect.any(String), quantity: expect.any(Number) });
    expect(ind.id && c.id).toBeTruthy();
  });

  it("can be limited to one store", async () => {
    const w = await world();
    const it = await w.item();
    await recv(w, { item: it.id, batchNo: "X", expiry: addDays(TODAY, 10), qty: 2, cost: 700, store: w.other.id });
    const d = await getDashboard({ storeId: w.other.id });
    expect(d.bands[0]).toMatchObject({ key: "d30", count: 1, valuePaise: 1400 });
    expect(d.recent.every((m) => m.storeName.startsWith("Other-"))).toBe(true);
  });
});
