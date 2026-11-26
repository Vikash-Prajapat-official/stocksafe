import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { splitFefo, todayIST } from "@/lib/fefo";
import { getLedger } from "@/lib/ledger";
import {
  adjust,
  dispense,
  issue,
  ledgerMismatches,
  previewPicks,
  receive,
  returnToSupplier,
  transfer,
  writeOff,
} from "@/lib/stock";

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

async function world() {
  const [admin, keeper, pharmacist] = await Promise.all(
    (["ADMIN", "STOREKEEPER", "PHARMACIST"] as const).map((role) =>
      db.user.create({ data: { name: role, phone: uid(), passwordHash: "x", role } }),
    ),
  );
  const [s0, s1] = await Promise.all(
    ["MAIN", "PHARMACY"].map((type, i) =>
      db.store.create({ data: { name: `S${i}-${uid()}`, type: type as "MAIN" | "PHARMACY" } }),
    ),
  );
  const supplier = await db.supplier.create({ data: { name: `Sup-${uid()}` } });
  const item = await db.item.create({ data: { name: `Item-${uid()}`, form: "TABLET", unit: "tablet" } });
  return { admin: admin!, keeper: keeper!, pharmacist: pharmacist!, s0: s0!, s1: s1!, supplier, item };
}
type World = Awaited<ReturnType<typeof world>>;

async function recv(
  w: World,
  o: { store?: string; item?: string; batchNo: string; expiry: string; qty: number; today?: string; cost?: number; mrp?: number },
) {
  return receive(
    {
      storeId: o.store ?? w.s0.id,
      supplierId: w.supplier.id,
      invoiceNo: `INV-${uid()}`,
      invoiceDate: TODAY,
      actorUserId: w.keeper.id,
      lines: [
        {
          itemId: o.item ?? w.item.id,
          batchNo: o.batchNo,
          expiryDate: o.expiry,
          quantity: o.qty,
          mrpPaise: o.mrp ?? 2000,
          costPaise: o.cost ?? 1500,
        },
      ],
    },
    o.today ? { today: o.today } : undefined,
  );
}
const batchIdOf = async (w: World, batchNo: string) =>
  (await db.batch.findUniqueOrThrow({ where: { itemId_batchNo: { itemId: w.item.id, batchNo } } })).id;
const balance = async (storeId: string, batchId: string) =>
  (await db.stockBalance.findUnique({ where: { storeId_batchId: { storeId, batchId } } }))?.quantity ?? 0;
const movements = (storeId: string, batchId: string) =>
  db.stockMovement.findMany({ where: { storeId, batchId }, orderBy: { seq: "asc" } });
const noMismatch = async (...storeIds: string[]) => expect(await ledgerMismatches({ storeIds })).toEqual([]);

afterAll(() => db.$disconnect());

// ---------- receive ----------
describe("receive", () => {
  it("creates the GRN, batch, balance and a RECEIPT movement in one go", async () => {
    const w = await world();
    const r = await receive({
      storeId: w.s0.id,
      supplierId: w.supplier.id,
      invoiceNo: "INV-1",
      invoiceDate: TODAY,
      actorUserId: w.keeper.id,
      lines: [
        { itemId: w.item.id, batchNo: "b1", expiryDate: addDays(TODAY, 200), quantity: 100, mrpPaise: 2500, costPaise: 1999 },
      ],
    });
    expect(r.totalPaise).toBe(199900);
    const batch = await db.batch.findUniqueOrThrow({ where: { itemId_batchNo: { itemId: w.item.id, batchNo: "B1" } } });
    expect(batch).toMatchObject({ mrpPaise: 2500, costPaise: 1999, supplierId: w.supplier.id });
    expect(await balance(w.s0.id, batch.id)).toBe(100);
    const [m] = await movements(w.s0.id, batch.id);
    expect(m).toMatchObject({ type: "RECEIPT", quantity: 100, refType: "GRN", refId: r.grnId, actorUserId: w.keeper.id });
    expect(await db.grn.findUniqueOrThrow({ where: { id: r.grnId } })).toMatchObject({ invoiceNo: "INV-1", totalPaise: 199900 });
    await noMismatch(w.s0.id);
  });

  it("normalises batch numbers (trim, spaces, upper case) so typing variants hit one batch", async () => {
    const w = await world();
    await recv(w, { batchNo: " ab - 1 ", expiry: addDays(TODAY, 90), qty: 5 });
    await recv(w, { batchNo: "AB - 1", expiry: addDays(TODAY, 90), qty: 7 });
    const batches = await db.batch.findMany({ where: { itemId: w.item.id } });
    expect(batches).toHaveLength(1);
    expect(batches[0]!.batchNo).toBe("AB - 1");
    expect(await balance(w.s0.id, batches[0]!.id)).toBe(12);
  });

  it("rejects the same batch number with a different expiry date", async () => {
    const w = await world();
    await recv(w, { batchNo: "X1", expiry: addDays(TODAY, 90), qty: 5 });
    await expect(recv(w, { batchNo: "X1", expiry: addDays(TODAY, 91), qty: 5 })).rejects.toMatchObject({ code: "BATCH_MISMATCH" });
  });

  it("keeps the first price and warns when a later receipt of the same batch has a different price", async () => {
    const w = await world();
    await recv(w, { batchNo: "P1", expiry: addDays(TODAY, 90), qty: 5, cost: 1000 });
    const r = await recv(w, { batchNo: "P1", expiry: addDays(TODAY, 90), qty: 5, cost: 1200 });
    expect(r.warnings.join(" ")).toMatch(/price/i);
    expect((await db.batch.findUniqueOrThrow({ where: { itemId_batchNo: { itemId: w.item.id, batchNo: "P1" } } })).costPaise).toBe(1000);
  });

  it("rejects stock that is already expired", async () => {
    const w = await world();
    await expect(recv(w, { batchNo: "OLD", expiry: addDays(TODAY, -1), qty: 5 })).rejects.toMatchObject({ code: "EXPIRED_BATCH" });
    expect(await db.batch.count({ where: { itemId: w.item.id } })).toBe(0);
  });

  it("is atomic: a bad second line leaves no GRN, batch, balance or movement", async () => {
    const w = await world();
    await expect(
      receive({
        storeId: w.s0.id,
        supplierId: w.supplier.id,
        invoiceNo: "ATOMIC",
        invoiceDate: TODAY,
        actorUserId: w.keeper.id,
        lines: [
          { itemId: w.item.id, batchNo: "OK1", expiryDate: addDays(TODAY, 30), quantity: 5, mrpPaise: 1, costPaise: 1 },
          { itemId: "does-not-exist", batchNo: "OK2", expiryDate: addDays(TODAY, 30), quantity: 5, mrpPaise: 1, costPaise: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.grn.count({ where: { invoiceNo: "ATOMIC" } })).toBe(0);
    expect(await db.batch.count({ where: { itemId: w.item.id } })).toBe(0);
    await noMismatch(w.s0.id);
  });

  it.each([
    ["zero quantity", { quantity: 0 }],
    ["fractional quantity", { quantity: 1.5 }],
    ["negative price", { costPaise: -1 }],
    ["empty batch number", { batchNo: "  " }],
    ["bad expiry date", { expiryDate: "2027-13-45" }],
  ])("validates input: %s", async (_name, patch) => {
    const w = await world();
    const line = { itemId: w.item.id, batchNo: "V1", expiryDate: addDays(TODAY, 30), quantity: 1, mrpPaise: 1, costPaise: 1, ...patch };
    await expect(
      receive({ storeId: w.s0.id, supplierId: w.supplier.id, invoiceNo: "V", invoiceDate: TODAY, actorUserId: w.keeper.id, lines: [line] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects unknown supplier/store and inactive items", async () => {
    const w = await world();
    const base = { storeId: w.s0.id, supplierId: w.supplier.id, invoiceNo: "I", invoiceDate: TODAY, actorUserId: w.keeper.id };
    const line = { itemId: w.item.id, batchNo: "N1", expiryDate: addDays(TODAY, 30), quantity: 1, mrpPaise: 1, costPaise: 1 };
    await expect(receive({ ...base, supplierId: "nope", lines: [line] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(receive({ ...base, storeId: "nope", lines: [line] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.item.update({ where: { id: w.item.id }, data: { active: false } });
    await expect(receive({ ...base, lines: [line] })).rejects.toMatchObject({ code: "INACTIVE" });
  });

  it("two lines for the same batch in one GRN add up", async () => {
    const w = await world();
    const line = { itemId: w.item.id, batchNo: "TWICE", expiryDate: addDays(TODAY, 60), quantity: 4, mrpPaise: 10, costPaise: 5 };
    const r = await receive({ storeId: w.s0.id, supplierId: w.supplier.id, invoiceNo: "T", invoiceDate: TODAY, actorUserId: w.keeper.id, lines: [line, line] });
    expect(r.totalPaise).toBe(40);
    expect(await balance(w.s0.id, await batchIdOf(w, "TWICE"))).toBe(8);
    await noMismatch(w.s0.id);
  });

  it("20 simultaneous receipts of the same brand-new batch all succeed and add up", async () => {
    const w = await world();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => recv(w, { batchNo: "RACE", expiry: addDays(TODAY, 60), qty: 3 })),
    );
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(await db.batch.count({ where: { itemId: w.item.id } })).toBe(1);
    expect(await balance(w.s0.id, await batchIdOf(w, "RACE"))).toBe(60);
    await noMismatch(w.s0.id);
  });
});

// ---------- issue (FEFO) ----------
describe("issue", () => {
  async function stocked() {
    const w = await world();
    await recv(w, { batchNo: "LATE", expiry: addDays(TODAY, 300), qty: 50 });
    await recv(w, { batchNo: "EARLY", expiry: addDays(TODAY, 40), qty: 10 });
    await recv(w, { batchNo: "OLD", expiry: addDays(TODAY, -10), qty: 25, today: LONG_AGO }); // expired
    return w;
  }
  const doIssue = (w: World, quantity: number, extra: Partial<Parameters<typeof issue>[0]["lines"][number]> = {}) =>
    issue({ storeId: w.s0.id, reason: "Ward use", actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity, ...extra }] });

  it("issues the earliest-expiring batch first, spilling into the next, never the expired one", async () => {
    const w = await stocked();
    const r = await doIssue(w, 25);
    expect(r.picks.map((p) => [p.batchNo, p.quantity])).toEqual([["EARLY", 10], ["LATE", 15]]);
    expect(await balance(w.s0.id, await batchIdOf(w, "EARLY"))).toBe(0);
    expect(await balance(w.s0.id, await batchIdOf(w, "LATE"))).toBe(35);
    expect(await balance(w.s0.id, await batchIdOf(w, "OLD"))).toBe(25); // untouched
    const ms = await movements(w.s0.id, await batchIdOf(w, "EARLY"));
    expect(ms.at(-1)).toMatchObject({ type: "ISSUE", quantity: -10, refType: "ISSUE", refId: r.refId, reason: "Ward use" });
    await noMismatch(w.s0.id);
  });

  it("fails with INSUFFICIENT_STOCK, counting only non-expired stock, and changes nothing", async () => {
    const w = await stocked();
    const err = await doIssue(w, 61).catch((e) => e);
    expect(err).toMatchObject({ code: "INSUFFICIENT_STOCK", status: 409 });
    expect(err.details).toMatchObject({ requested: 61, available: 60, expired: 25 });
    expect(await balance(w.s0.id, await batchIdOf(w, "EARLY"))).toBe(10);
    await noMismatch(w.s0.id);
  });

  it("is all-or-nothing across lines", async () => {
    const w = await stocked();
    const other = await db.item.create({ data: { name: `Other-${uid()}`, form: "TABLET", unit: "tablet" } });
    await expect(
      issue({
        storeId: w.s0.id,
        reason: "Ward use",
        actorUserId: w.keeper.id,
        lines: [{ itemId: w.item.id, quantity: 5 }, { itemId: other.id, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await balance(w.s0.id, await batchIdOf(w, "EARLY"))).toBe(10);
  });

  it("requires a reason", async () => {
    const w = await stocked();
    await expect(issue({ storeId: w.s0.id, reason: " ", actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: 1 }] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("manual batch choice (override) needs a reason and is recorded", async () => {
    const w = await stocked();
    const late = await batchIdOf(w, "LATE");
    await expect(doIssue(w, 5, { batchId: late })).rejects.toMatchObject({ code: "OVERRIDE_REASON_REQUIRED" });
    const r = await doIssue(w, 5, { batchId: late, overrideReason: "Patient needs the larger pack" });
    expect(r.picks).toMatchObject([{ batchNo: "LATE", quantity: 5 }]);
    const last = (await movements(w.s0.id, late)).at(-1)!;
    expect(last.reason).toContain("FEFO override");
    expect(last.reason).toContain("Patient needs the larger pack");
    expect(await balance(w.s0.id, await batchIdOf(w, "EARLY"))).toBe(10);
  });

  it("never issues an expired batch, even with an override reason", async () => {
    const w = await stocked();
    await expect(doIssue(w, 1, { batchId: await batchIdOf(w, "OLD"), overrideReason: "please" })).rejects.toMatchObject({ code: "EXPIRED_BATCH" });
  });

  it("override checks the batch belongs to the item and has enough stock", async () => {
    const w = await stocked();
    const otherItem = await db.item.create({ data: { name: `O-${uid()}`, form: "TABLET", unit: "tablet" } });
    // a batch id that does not exist, and a real batch of a different item
    await expect(
      issue({ storeId: w.s0.id, reason: "r", actorUserId: w.keeper.id, lines: [{ itemId: otherItem.id, quantity: 1, batchId: "bogus", overrideReason: "because" }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      issue({ storeId: w.s0.id, reason: "r", actorUserId: w.keeper.id, lines: [{ itemId: otherItem.id, quantity: 1, batchId: await batchIdOf(w, "LATE"), overrideReason: "because" }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(doIssue(w, 11, { batchId: await batchIdOf(w, "EARLY"), overrideReason: "because" })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("the same item on two lines is handled against the updated balances", async () => {
    const w = await stocked();
    const r = await issue({
      storeId: w.s0.id,
      reason: "r",
      actorUserId: w.keeper.id,
      lines: [{ itemId: w.item.id, quantity: 8 }, { itemId: w.item.id, quantity: 8 }],
    });
    expect(r.picks.map((p) => [p.batchNo, p.quantity])).toEqual([["EARLY", 8], ["EARLY", 2], ["LATE", 6]]);
    await noMismatch(w.s0.id);
  });

  it("previewPicks shows the FEFO split without writing anything", async () => {
    const w = await stocked();
    const p = await previewPicks({ storeId: w.s0.id, lines: [{ itemId: w.item.id, quantity: 12 }] });
    expect(p[0]!.picks.map((x) => [x.batchNo, x.quantity])).toEqual([["EARLY", 10], ["LATE", 2]]);
    expect(await db.stockMovement.count({ where: { storeId: w.s0.id, type: "ISSUE" } })).toBe(0);
  });
});

// ---------- transfer ----------
describe("transfer", () => {
  it("moves stock FEFO with a paired TRANSFER_OUT and TRANSFER_IN sharing one reference", async () => {
    const w = await world();
    await recv(w, { batchNo: "A", expiry: addDays(TODAY, 30), qty: 6 });
    await recv(w, { batchNo: "B", expiry: addDays(TODAY, 90), qty: 20 });
    const r = await transfer({ fromStoreId: w.s0.id, toStoreId: w.s1.id, actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: 10 }] });
    const a = await batchIdOf(w, "A"), b = await batchIdOf(w, "B");
    expect([await balance(w.s0.id, a), await balance(w.s0.id, b)]).toEqual([0, 16]);
    expect([await balance(w.s1.id, a), await balance(w.s1.id, b)]).toEqual([6, 4]);
    const out = await db.stockMovement.findMany({ where: { refId: r.refId, type: "TRANSFER_OUT" } });
    const inn = await db.stockMovement.findMany({ where: { refId: r.refId, type: "TRANSFER_IN" } });
    expect(out.reduce((s, m) => s + m.quantity, 0)).toBe(-10);
    expect(inn.reduce((s, m) => s + m.quantity, 0)).toBe(10);
    expect(new Set([...out, ...inn].map((m) => m.refType))).toEqual(new Set(["TRANSFER"]));
    await noMismatch(w.s0.id, w.s1.id);
  });

  it("rejects the same store and leaves the stock alone when short", async () => {
    const w = await world();
    await recv(w, { batchNo: "A", expiry: addDays(TODAY, 30), qty: 3 });
    await expect(transfer({ fromStoreId: w.s0.id, toStoreId: w.s0.id, actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: 1 }] })).rejects.toMatchObject({ code: "SAME_STORE" });
    await expect(transfer({ fromStoreId: w.s0.id, toStoreId: w.s1.id, actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: 4 }] })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await balance(w.s0.id, await batchIdOf(w, "A"))).toBe(3);
    expect(await balance(w.s1.id, await batchIdOf(w, "A"))).toBe(0);
  });

  it("rejects an inactive or unknown destination", async () => {
    const w = await world();
    await recv(w, { batchNo: "A", expiry: addDays(TODAY, 30), qty: 3 });
    await db.store.update({ where: { id: w.s1.id }, data: { active: false } });
    await expect(transfer({ fromStoreId: w.s0.id, toStoreId: w.s1.id, actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: 1 }] })).rejects.toMatchObject({ code: "INACTIVE" });
    await expect(transfer({ fromStoreId: w.s0.id, toStoreId: "nope", actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: 1 }] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ---------- dispense ----------
describe("dispense", () => {
  it("dispenses FEFO and records the patient label on every movement", async () => {
    const w = await world();
    await recv(w, { store: w.s1.id, batchNo: "A", expiry: addDays(TODAY, 30), qty: 4 });
    await recv(w, { store: w.s1.id, batchNo: "B", expiry: addDays(TODAY, 90), qty: 20 });
    const r = await dispense({ storeId: w.s1.id, patientLabel: "  OPD token 42 ", actorUserId: w.pharmacist.id, lines: [{ itemId: w.item.id, quantity: 6 }] });
    expect(r.picks.map((p) => [p.batchNo, p.quantity])).toEqual([["A", 4], ["B", 2]]);
    const ms = await db.stockMovement.findMany({ where: { refId: r.refId }, include: { patient: true } });
    expect(ms).toHaveLength(2);
    for (const m of ms) {
      expect(m).toMatchObject({ type: "DISPENSE", refType: "DISPENSE" });
      expect(m.patient).toMatchObject({ label: "OPD token 42" }); // kept beside the ledger, not in it
    }
    await noMismatch(w.s1.id);
  });

  it("allows no patient label, rejects an overlong one, and cannot dispense expired stock", async () => {
    const w = await world();
    await recv(w, { store: w.s1.id, batchNo: "OLD", expiry: addDays(TODAY, -5), qty: 9, today: LONG_AGO });
    await expect(dispense({ storeId: w.s1.id, actorUserId: w.pharmacist.id, lines: [{ itemId: w.item.id, quantity: 1 }] })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await recv(w, { store: w.s1.id, batchNo: "NEW", expiry: addDays(TODAY, 60), qty: 2 });
    await expect(dispense({ storeId: w.s1.id, patientLabel: "x".repeat(101), actorUserId: w.pharmacist.id, lines: [{ itemId: w.item.id, quantity: 1 }] })).rejects.toMatchObject({ code: "VALIDATION" });
    const ok = await dispense({ storeId: w.s1.id, actorUserId: w.pharmacist.id, lines: [{ itemId: w.item.id, quantity: 1 }] });
    expect((await db.stockMovement.findFirstOrThrow({ where: { refId: ok.refId }, include: { patient: true } })).patient).toBeNull();
  });
});

// ---------- approvals: return, write-off, adjust ----------
describe("returnToSupplier, writeOff, adjust", () => {
  async function withBatches() {
    const w = await world();
    await recv(w, { batchNo: "GOOD", expiry: addDays(TODAY, 100), qty: 30, cost: 1999 });
    await recv(w, { batchNo: "OLD", expiry: addDays(TODAY, -3), qty: 12, cost: 1999, today: LONG_AGO });
    return { w, good: await batchIdOf(w, "GOOD"), old: await batchIdOf(w, "OLD") };
  }

  it("return to supplier records the approver and reason, and reduces stock", async () => {
    const { w, good } = await withBatches();
    const r = await returnToSupplier({ storeId: w.s0.id, batchId: good, quantity: 5, reason: "Damaged in transit", actorUserId: w.admin.id, approvedBy: w.admin.id });
    expect(r.valuePaise).toBe(5 * 1999);
    const m = (await movements(w.s0.id, good)).at(-1)!;
    expect(m).toMatchObject({ type: "RETURN_TO_SUPPLIER", quantity: -5, reason: "Damaged in transit", approvedBy: w.admin.id });
    expect(await balance(w.s0.id, good)).toBe(25);
    await noMismatch(w.s0.id);
  });

  it("requires an active ADMIN approver and a reason", async () => {
    const { w, good } = await withBatches();
    const base = { storeId: w.s0.id, batchId: good, quantity: 1, actorUserId: w.keeper.id };
    await expect(returnToSupplier({ ...base, reason: "r", approvedBy: w.keeper.id })).rejects.toMatchObject({ code: "APPROVER_REQUIRED" });
    await expect(returnToSupplier({ ...base, reason: "r", approvedBy: "nobody" })).rejects.toMatchObject({ code: "APPROVER_REQUIRED" });
    await expect(returnToSupplier({ ...base, reason: " ", approvedBy: w.admin.id })).rejects.toMatchObject({ code: "VALIDATION" });
    await db.user.update({ where: { id: w.admin.id }, data: { active: false } });
    await expect(returnToSupplier({ ...base, reason: "r", approvedBy: w.admin.id })).rejects.toMatchObject({ code: "APPROVER_REQUIRED" });
  });

  it("write-off works only for expired batches and reports the rupee value", async () => {
    const { w, good, old } = await withBatches();
    const args = { storeId: w.s0.id, quantity: 12, actorUserId: w.admin.id, approvedBy: w.admin.id };
    await expect(writeOff({ ...args, batchId: good })).rejects.toMatchObject({ code: "NOT_EXPIRED" });
    const r = await writeOff({ ...args, batchId: old });
    expect(r.valuePaise).toBe(12 * 1999);
    expect((await movements(w.s0.id, old)).at(-1)).toMatchObject({ type: "EXPIRY_WRITEOFF", quantity: -12, approvedBy: w.admin.id });
    expect(await balance(w.s0.id, old)).toBe(0);
    await expect(writeOff({ ...args, quantity: 1, batchId: old })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await noMismatch(w.s0.id);
  });

  it("adjust adds or removes stock with a reason and approver, never below zero", async () => {
    const { w, good } = await withBatches();
    const base = { storeId: w.s0.id, batchId: good, actorUserId: w.admin.id, approvedBy: w.admin.id, reason: "Stock count variance" };
    await adjust({ ...base, delta: 4 });
    await adjust({ ...base, delta: -10 });
    expect(await balance(w.s0.id, good)).toBe(24);
    expect((await movements(w.s0.id, good)).at(-1)).toMatchObject({ type: "ADJUSTMENT", quantity: -10, reason: "Stock count variance" });
    await expect(adjust({ ...base, delta: -25 })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expect(adjust({ ...base, delta: 0 })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(adjust({ ...base, delta: 1, reason: "" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(adjust({ ...base, delta: 1, approvedBy: w.keeper.id })).rejects.toMatchObject({ code: "APPROVER_REQUIRED" });
    await noMismatch(w.s0.id);
  });

  it("adjust can create a balance row for a batch that was never in that store", async () => {
    const { w, good } = await withBatches();
    await adjust({ storeId: w.s1.id, batchId: good, delta: 3, actorUserId: w.admin.id, approvedBy: w.admin.id, reason: "Found on shelf" });
    expect(await balance(w.s1.id, good)).toBe(3);
    await noMismatch(w.s0.id, w.s1.id);
  });
});

// ---------- the ledger is append-only ----------
describe("ledger integrity", () => {
  it("the database refuses to update or delete a movement", async () => {
    const w = await world();
    await recv(w, { batchNo: "A", expiry: addDays(TODAY, 30), qty: 3 });
    const m = (await movements(w.s0.id, await batchIdOf(w, "A")))[0]!;
    await expect(db.stockMovement.update({ where: { id: m.id }, data: { quantity: 999 } })).rejects.toThrow(/append-only|constraint/i);
    await expect(db.stockMovement.delete({ where: { id: m.id } })).rejects.toThrow(/append-only|constraint/i);
  });

  it("the database refuses a negative balance", async () => {
    const w = await world();
    await recv(w, { batchNo: "A", expiry: addDays(TODAY, 30), qty: 3 });
    await expect(
      db.stockBalance.update({ where: { storeId_batchId: { storeId: w.s0.id, batchId: await batchIdOf(w, "A") } }, data: { quantity: -1 } }),
    ).rejects.toThrow();
  });

  it("ledgerMismatches detects a balance that does not match the movements", async () => {
    const w = await world();
    await recv(w, { batchNo: "A", expiry: addDays(TODAY, 30), qty: 3 });
    const batchId = await batchIdOf(w, "A");
    await db.stockBalance.update({ where: { storeId_batchId: { storeId: w.s0.id, batchId } }, data: { quantity: 5 } }); // tamper
    expect(await ledgerMismatches({ storeIds: [w.s0.id] })).toEqual([{ storeId: w.s0.id, batchId, balance: 5, ledger: 3 }]);
  });
});

// ---------- bin card ----------
describe("getLedger (bin card)", () => {
  it("shows a running balance per store and batch, oldest first", async () => {
    const w = await world();
    await recv(w, { batchNo: "A", expiry: addDays(TODAY, 30), qty: 10 });
    await issue({ storeId: w.s0.id, reason: "r", actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: 3 }] });
    await transfer({ fromStoreId: w.s0.id, toStoreId: w.s1.id, actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: 2 }] });
    await dispense({ storeId: w.s1.id, patientLabel: "T1", actorUserId: w.pharmacist.id, lines: [{ itemId: w.item.id, quantity: 1 }] });

    const main = await getLedger({ itemId: w.item.id, storeId: w.s0.id });
    expect(main.rows.map((r) => [r.type, r.quantity, r.balanceAfter])).toEqual([
      ["RECEIPT", 10, 10],
      ["ISSUE", -3, 7],
      ["TRANSFER_OUT", -2, 5],
    ]);
    const pharm = await getLedger({ itemId: w.item.id, storeId: w.s1.id });
    expect(pharm.rows.map((r) => [r.type, r.quantity, r.balanceAfter])).toEqual([
      ["TRANSFER_IN", 2, 2],
      ["DISPENSE", -1, 1],
    ]);
    expect(pharm.rows[1]).toMatchObject({ patientLabel: "T1", batchNo: "A", actorName: "PHARMACIST" });
    const all = await getLedger({ itemId: w.item.id });
    expect(all.total).toBe(5);
  });
});

// ---------- property test: random sequences against an in-memory model ----------
describe("property: for any sequence of operations the ledger matches the balances", () => {
  type Op =
    | { k: "receive"; store: 0 | 1; batch: 0 | 1; qty: number }
    | { k: "issue"; store: 0 | 1; qty: number }
    | { k: "transfer"; from: 0 | 1; qty: number }
    | { k: "dispense"; store: 0 | 1; qty: number }
    | { k: "adjust"; store: 0 | 1; batch: 0 | 1 | 2; delta: number }
    | { k: "return"; store: 0 | 1; batch: 0 | 1 | 2; qty: number }
    | { k: "writeoff"; store: 0 | 1; qty: number };

  const st = fc.constantFrom<0 | 1>(0, 1);
  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ k: fc.constant("receive" as const), store: st, batch: fc.constantFrom<0 | 1>(0, 1), qty: fc.integer({ min: 1, max: 25 }) }),
    fc.record({ k: fc.constant("issue" as const), store: st, qty: fc.integer({ min: 1, max: 40 }) }),
    fc.record({ k: fc.constant("transfer" as const), from: st, qty: fc.integer({ min: 1, max: 40 }) }),
    fc.record({ k: fc.constant("dispense" as const), store: st, qty: fc.integer({ min: 1, max: 40 }) }),
    fc.record({ k: fc.constant("adjust" as const), store: st, batch: fc.constantFrom<0 | 1 | 2>(0, 1, 2), delta: fc.integer({ min: -12, max: 12 }).filter((d) => d !== 0) }),
    fc.record({ k: fc.constant("return" as const), store: st, batch: fc.constantFrom<0 | 1 | 2>(0, 1, 2), qty: fc.integer({ min: 1, max: 20 }) }),
    fc.record({ k: fc.constant("writeoff" as const), store: st, qty: fc.integer({ min: 1, max: 20 }) }),
  );

  it("holds for random operation sequences, including operations that must fail", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(opArb, { minLength: 1, maxLength: 14 }), async (ops) => {
        const w = await world();
        const stores = [w.s0.id, w.s1.id];
        // batch 0 expires soonest, batch 1 later, batch 2 is already expired (received in the past)
        const expiry = [addDays(TODAY, 20), addDays(TODAY, 120), addDays(TODAY, -5)];
        const no = ["P0", "P1", "P2"];
        await recv(w, { batchNo: no[0]!, expiry: expiry[0]!, qty: 10 });
        await recv(w, { batchNo: no[1]!, expiry: expiry[1]!, qty: 10 });
        await recv(w, { batchNo: no[2]!, expiry: expiry[2]!, qty: 15, today: LONG_AGO });
        const ids = [await batchIdOf(w, no[0]!), await batchIdOf(w, no[1]!), await batchIdOf(w, no[2]!)];

        const model = new Map<string, number>();
        const key = (s: number, b: number) => `${s}|${b}`;
        const get = (s: number, b: number) => model.get(key(s, b)) ?? 0;
        const add = (s: number, b: number, d: number) => model.set(key(s, b), get(s, b) + d);
        add(0, 0, 10); add(0, 1, 10); add(0, 2, 15);

        const fefoModel = (s: number, qty: number) =>
          splitFefo(
            [0, 1, 2].map((b) => ({ batchId: String(b), expiryDate: expiry[b]!, quantity: get(s, b) })),
            qty,
            TODAY,
          );
        const admin = { actorUserId: w.admin.id, approvedBy: w.admin.id };

        for (const op of ops) {
          let expectFail: string | null = null;
          let promise: Promise<unknown>;
          switch (op.k) {
            case "receive":
              add(op.store, op.batch, op.qty);
              promise = recv(w, { store: stores[op.store]!, batchNo: no[op.batch]!, expiry: expiry[op.batch]!, qty: op.qty });
              break;
            case "issue":
            case "dispense":
            case "transfer": {
              const s = op.k === "transfer" ? op.from : op.store;
              const r = fefoModel(s, op.qty);
              if (r.ok) for (const p of r.picks) { add(s, Number(p.batchId), -p.quantity); if (op.k === "transfer") add(1 - s, Number(p.batchId), p.quantity); }
              else expectFail = "INSUFFICIENT_STOCK";
              const lines = [{ itemId: w.item.id, quantity: op.qty }];
              promise =
                op.k === "issue" ? issue({ storeId: stores[s]!, reason: "r", actorUserId: w.keeper.id, lines })
                : op.k === "dispense" ? dispense({ storeId: stores[s]!, actorUserId: w.pharmacist.id, lines })
                : transfer({ fromStoreId: stores[s]!, toStoreId: stores[1 - s]!, actorUserId: w.keeper.id, lines });
              break;
            }
            case "adjust":
              if (get(op.store, op.batch) + op.delta < 0) expectFail = "INSUFFICIENT_STOCK"; else add(op.store, op.batch, op.delta);
              promise = adjust({ storeId: stores[op.store]!, batchId: ids[op.batch]!, delta: op.delta, reason: "count", ...admin });
              break;
            case "return":
              if (get(op.store, op.batch) < op.qty) expectFail = "INSUFFICIENT_STOCK"; else add(op.store, op.batch, -op.qty);
              promise = returnToSupplier({ storeId: stores[op.store]!, batchId: ids[op.batch]!, quantity: op.qty, reason: "r", ...admin });
              break;
            case "writeoff":
              if (get(op.store, 2) < op.qty) expectFail = "INSUFFICIENT_STOCK"; else add(op.store, 2, -op.qty);
              promise = writeOff({ storeId: stores[op.store]!, batchId: ids[2]!, quantity: op.qty, ...admin });
              break;
          }
          if (expectFail) await expect(promise).rejects.toMatchObject({ code: expectFail });
          else await promise;

          // after every operation the database equals the model, and nothing is negative
          for (const s of [0, 1]) for (const b of [0, 1, 2]) {
            const actual = await balance(stores[s]!, ids[b]!);
            expect(actual, `store ${s} batch ${b} after ${JSON.stringify(op)}`).toBe(get(s, b));
            expect(actual).toBeGreaterThanOrEqual(0);
          }
        }
        // and the sum of the movements equals the balance for every store and batch
        expect(await ledgerMismatches({ storeIds: stores })).toEqual([]);
      }),
      { numRuns: 25 },
    );
  });
});

// ---------- concurrency ----------
describe("concurrency: two users can never issue the same last unit", () => {
  const one = (w: World, qty = 1, store = w.s0.id) =>
    issue({ storeId: store, reason: "race", actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: qty }] });

  it("20 parallel issues of 1 against the last 10 units: exactly 10 succeed", async () => {
    const w = await world();
    await recv(w, { batchNo: "LAST", expiry: addDays(TODAY, 60), qty: 10 });
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => one(w)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toBe(10);
    expect(failed).toHaveLength(10);
    for (const f of failed) expect(f.reason).toMatchObject({ code: "INSUFFICIENT_STOCK" });
    const id = await batchIdOf(w, "LAST");
    expect(await balance(w.s0.id, id)).toBe(0);
    const issued = (await movements(w.s0.id, id)).filter((m) => m.type === "ISSUE").reduce((s, m) => s - m.quantity, 0);
    expect(issued).toBe(10);
    await noMismatch(w.s0.id);
  });

  it("20 parallel issues of random size never issue more than 10 in total", async () => {
    const w = await world();
    await recv(w, { batchNo: "LAST", expiry: addDays(TODAY, 60), qty: 10 });
    const sizes = Array.from({ length: 20 }, (_, i) => (i % 4) + 1);
    const results = await Promise.allSettled(sizes.map((q) => one(w, q)));
    const issued = results.reduce((s, r, i) => s + (r.status === "fulfilled" ? sizes[i]! : 0), 0);
    expect(issued).toBeLessThanOrEqual(10);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await balance(w.s0.id, await batchIdOf(w, "LAST"))).toBe(10 - issued);
    await noMismatch(w.s0.id);
  });

  it("works when the last 10 units are spread over three batches", async () => {
    const w = await world();
    await recv(w, { batchNo: "A", expiry: addDays(TODAY, 30), qty: 4 });
    await recv(w, { batchNo: "B", expiry: addDays(TODAY, 60), qty: 3 });
    await recv(w, { batchNo: "C", expiry: addDays(TODAY, 90), qty: 3 });
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => one(w)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    for (const b of ["A", "B", "C"]) expect(await balance(w.s0.id, await batchIdOf(w, b))).toBe(0);
    await noMismatch(w.s0.id);
  });

  it("mixed parallel issue, dispense and transfer of the same stock stay consistent", async () => {
    const w = await world();
    await recv(w, { batchNo: "A", expiry: addDays(TODAY, 30), qty: 12 });
    const jobs = Array.from({ length: 24 }, (_, i) =>
      i % 3 === 0 ? one(w)
      : i % 3 === 1 ? dispense({ storeId: w.s0.id, actorUserId: w.pharmacist.id, lines: [{ itemId: w.item.id, quantity: 1 }] })
      : transfer({ fromStoreId: w.s0.id, toStoreId: w.s1.id, actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: 1 }] }),
    );
    const results = await Promise.allSettled(jobs);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(12);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "INSUFFICIENT_STOCK" });
    const id = await batchIdOf(w, "A");
    expect(await balance(w.s0.id, id)).toBe(0);
    await noMismatch(w.s0.id, w.s1.id);
  });

  it("opposite transfers at the same time (A to B and B to A) do not deadlock or lose stock", async () => {
    const w = await world();
    await recv(w, { store: w.s0.id, batchNo: "A", expiry: addDays(TODAY, 30), qty: 10 });
    await recv(w, { store: w.s1.id, batchNo: "A", expiry: addDays(TODAY, 30), qty: 10 });
    const t = (from: string, to: string) => transfer({ fromStoreId: from, toStoreId: to, actorUserId: w.keeper.id, lines: [{ itemId: w.item.id, quantity: 1 }] });
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => (i % 2 ? t(w.s0.id, w.s1.id) : t(w.s1.id, w.s0.id))));
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    const id = await batchIdOf(w, "A");
    expect((await balance(w.s0.id, id)) + (await balance(w.s1.id, id))).toBe(20);
    await noMismatch(w.s0.id, w.s1.id);
  });
});
