import type { AddressInfo } from "node:net";
import { SMTPServer } from "smtp-server";
import { afterAll, describe, expect, it } from "vitest";
import { listAudit } from "@/lib/audit-query";
import { db } from "@/lib/db";
import { isSqlite } from "@/lib/dialect";
import { todayIST } from "@/lib/fefo";
import { getLedger } from "@/lib/ledger";
import { anonymisePatientLabels } from "@/lib/retention";
import { buildReport } from "@/lib/reports";
import { nextSeq } from "@/lib/seq";
import { dispense, issue, ledgerMismatches, receive, writeOff } from "@/lib/stock";
import { createMailTransport, runAlertJob, runRetentionJob } from "@/worker/jobs";

// ---------- helpers ----------
// What a refused write to an append-only table looks like: PostgreSQL says "append-only"; Prisma reports SQLite's trigger abort as a constraint error.
const APPEND_ONLY = /append-only|constraint/i;
let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TODAY = todayIST();
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const LONG_AGO = addDays(TODAY, -400);
/** A moment at noon India time on the given day offset from today (away from any midnight boundary). */
const istNoon = (offset: number) => new Date(`${addDays(TODAY, offset)}T06:30:00Z`);

async function world() {
  const mk = (role: "ADMIN" | "STOREKEEPER" | "PHARMACIST") => db.user.create({ data: { name: role, phone: uid(), passwordHash: "x", role } });
  const [admin, keeper, pharmacist] = await Promise.all([mk("ADMIN"), mk("STOREKEEPER"), mk("PHARMACIST")]);
  const store = await db.store.create({ data: { name: `Store-${uid()}`, type: "MAIN" } });
  const other = await db.store.create({ data: { name: `Other-${uid()}`, type: "MAIN" } });
  const supplier = await db.supplier.create({ data: { name: `Sup-${uid()}` } });
  const item = (name?: string) => db.item.create({ data: { name: name ?? `Item-${uid()}`, form: "TABLET", unit: "tablet" } });
  if (!(await db.hospital.findFirst())) await db.hospital.create({ data: { name: "Test Hospital" } });
  return { admin, keeper, pharmacist, store, other, supplier, item };
}
type W = Awaited<ReturnType<typeof world>>;

async function recv(w: W, o: { store?: string; item: string; batchNo: string; expiry: string; qty: number; cost?: number; today?: string }) {
  return receive(
    {
      storeId: o.store ?? w.store.id,
      supplierId: w.supplier.id,
      invoiceNo: `INV-${uid()}`,
      invoiceDate: TODAY,
      actorUserId: w.keeper.id,
      lines: [{ itemId: o.item, batchNo: o.batchNo, expiryDate: o.expiry, quantity: o.qty, mrpPaise: 999, costPaise: o.cost ?? 100 }],
    },
    o.today ? { today: o.today } : undefined,
  );
}
const dispenseOne = (w: W, itemId: string, quantity: number, patientLabel?: string, storeId = w.store.id) =>
  dispense({ storeId, actorUserId: w.pharmacist.id, patientLabel, lines: [{ itemId, quantity }] });

afterAll(() => db.$disconnect());

// ---------- patient labels and retention ----------
describe("patient labels live beside the ledger, so retention never touches a movement", () => {
  it("stores the label for the movements of a dispensing, and none when no label is given", async () => {
    const w = await world();
    const it = await w.item();
    await recv(w, { item: it.id, batchNo: "A", expiry: addDays(TODAY, 90), qty: 50 });
    const a = await dispenseOne(w, it.id, 2, "  OPD token 7 ");
    const b = await dispenseOne(w, it.id, 1);
    const ms = await db.stockMovement.findMany({ where: { refId: { in: [a.refId, b.refId] } }, include: { patient: true } });
    expect(ms.find((m) => m.refId === a.refId)!.patient).toMatchObject({ label: "OPD token 7", anonymisedAt: null });
    expect(ms.find((m) => m.refId === b.refId)!.patient).toBeNull();
    const ledger = await getLedger({ itemId: it.id, storeId: w.store.id });
    expect(ledger.rows.map((r) => r.patientLabel)).toEqual([null, "OPD token 7", null]);
  });

  it("anonymises labels older than the retention period and leaves newer ones and the ledger alone", async () => {
    const w = await world();
    const it = await w.item();
    await recv(w, { item: it.id, batchNo: "A", expiry: addDays(TODAY, 90), qty: 50 });
    const old1 = await dispenseOne(w, it.id, 1, "Ramesh Kumar");
    const old2 = await dispenseOne(w, it.id, 1, "Sita Devi");
    const fresh = await dispenseOne(w, it.id, 1, "OPD 99");
    await db.movementPatient.updateMany({ where: { movement: { refId: { in: [old1.refId, old2.refId] } } }, data: { createdAt: new Date(Date.now() - 100 * 86_400_000) } });
    const movementsBefore = await db.stockMovement.findMany({ where: { storeId: w.store.id }, orderBy: { seq: "asc" } });

    expect(await anonymisePatientLabels({ days: 90 })).toBeGreaterThanOrEqual(2);
    const labels = await db.movementPatient.findMany({ where: { movement: { storeId: w.store.id } }, include: { movement: true } });
    const byRef = new Map(labels.map((l) => [l.movement.refId, l]));
    expect(byRef.get(old1.refId)).toMatchObject({ label: null, anonymisedAt: expect.any(Date) });
    expect(byRef.get(old2.refId)).toMatchObject({ label: null, anonymisedAt: expect.any(Date) });
    expect(byRef.get(fresh.refId)).toMatchObject({ label: "OPD 99", anonymisedAt: null });

    // the ledger itself is byte-for-byte what it was, and still balances
    expect(await db.stockMovement.findMany({ where: { storeId: w.store.id }, orderBy: { seq: "asc" } })).toEqual(movementsBefore);
    expect(await ledgerMismatches({ storeIds: [w.store.id] })).toEqual([]);
    // the bin card says so in words
    const ledger = await getLedger({ itemId: it.id, storeId: w.store.id });
    expect(ledger.rows.map((r) => r.patientLabel)).toEqual([null, "[anonymised]", "[anonymised]", "OPD 99"]);
    // running it again finds nothing more to do for these
    const again = await anonymisePatientLabels({ days: 90 });
    const stillThere = await db.movementPatient.count({ where: { movement: { storeId: w.store.id }, label: { not: null } } });
    expect(stillThere).toBe(1);
    expect(again).toBeGreaterThanOrEqual(0);
  });

  it("uses the given 'now' and refuses a retention period below one day", async () => {
    const w = await world();
    const it = await w.item();
    await recv(w, { item: it.id, batchNo: "A", expiry: addDays(TODAY, 90), qty: 5 });
    const d = await dispenseOne(w, it.id, 1, "Asha");
    const inTenDays = new Date(Date.now() + 10 * 86_400_000);
    await anonymisePatientLabels({ days: 7, now: inTenDays });
    expect((await db.movementPatient.findFirstOrThrow({ where: { movement: { refId: d.refId } } })).label).toBeNull();
    await expect(anonymisePatientLabels({ days: 0 })).rejects.toThrow(RangeError);
    await expect(anonymisePatientLabels({ days: 1.5 })).rejects.toThrow(RangeError);
  });

  it("the retention job records what it did in the audit log", async () => {
    const r = await runRetentionJob({ days: 90 });
    expect(r).toMatchObject({ date: TODAY, anonymised: expect.any(Number) });
    const entries = (await listAudit({ action: "RETENTION_RUN", pageSize: 5 })).rows;
    expect(entries[0]).toMatchObject({ action: "RETENTION_RUN", entity: "job", actorName: null });
    expect(entries[0]!.entityId).toContain(TODAY);
  });
});

// ---------- audit log ----------
describe("audit log", () => {
  it("cannot be edited or deleted, even by direct SQL", async () => {
    const w = await world();
    const row = await db.auditLog.create({ data: { actorUserId: w.admin.id, action: "TEST_ACTION", entity: "test", entityId: "1" } });
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: "CHANGED" } })).rejects.toThrow(APPEND_ONLY);
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(APPEND_ONLY);
    // PostgreSQL has a separate guard for TRUNCATE (it skips row triggers); SQLite has no TRUNCATE, only a bulk delete
    await expect(isSqlite ? db.$executeRaw`DELETE FROM audit_log` : db.$executeRaw`TRUNCATE audit_log`).rejects.toThrow(APPEND_ONLY);
  });

  it("can be filtered by who, what, entity and date, newest first, with paging", async () => {
    const w = await world();
    const a = `ACT_${uid()}`;
    for (let i = 0; i < 5; i++) await db.auditLog.create({ data: { actorUserId: w.admin.id, action: a, entity: "thing", entityId: String(i), at: new Date(Date.now() - i * 1000) } });
    await db.auditLog.create({ data: { actorUserId: w.keeper.id, action: a, entity: "other", entityId: "x" } });
    const all = await listAudit({ action: a });
    expect(all.total).toBe(6);
    expect(all.rows[0]!.at.getTime()).toBeGreaterThanOrEqual(all.rows[1]!.at.getTime());
    expect((await listAudit({ action: a, actorId: w.admin.id })).total).toBe(5);
    expect((await listAudit({ action: a, entity: "other" })).rows[0]).toMatchObject({ actorName: "STOREKEEPER", entityId: "x" });
    const page2 = await listAudit({ action: a, pageSize: 4, page: 2 });
    expect(page2.rows).toHaveLength(2);
    expect(page2.total).toBe(6);
    for (const bad of ["2026-13-45", "2026-02-30", "27-11-2026", "yesterday"]) await expect(listAudit({ from: bad })).rejects.toThrow(RangeError);
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await listAudit({ action: a, from: future })).total).toBe(0);
  });

  it("really records stock actions (the audit rows written inside the transactions)", async () => {
    const w = await world();
    const it = await w.item();
    await recv(w, { item: it.id, batchNo: "A", expiry: addDays(TODAY, 90), qty: 5 });
    await issue({ storeId: w.store.id, reason: "r", actorUserId: w.keeper.id, lines: [{ itemId: it.id, quantity: 1 }] });
    const rows = (await listAudit({ actorId: w.keeper.id })).rows.map((r) => r.action).sort();
    expect(rows).toEqual(["GRN_CREATE", "STOCK_ISSUE"]);
  });
});

// ---------- reports ----------
describe("reports", () => {
  const cell = (r: Awaited<ReturnType<typeof buildReport>>, key: string, match: string) => r.rows.find((x) => String(x.item).startsWith(match))?.[key];

  it("stock on hand splits usable from expired and values both at cost", async () => {
    const w = await world();
    const it = await w.item("StockReportItem");
    await recv(w, { item: it.id, batchNo: "GOOD", expiry: addDays(TODAY, 200), qty: 30, cost: 100 });
    await recv(w, { item: it.id, batchNo: "OLD", expiry: addDays(TODAY, -3), qty: 4, cost: 500, today: LONG_AGO });
    await recv(w, { store: w.other.id, item: it.id, batchNo: "GOOD", expiry: addDays(TODAY, 200), qty: 7, cost: 100 });

    const mine = await buildReport("stock", { storeId: w.store.id });
    expect(mine.columns.map((c) => c.key)).toEqual(["item", "unit", "usableQty", "expiredQty", "usableValue", "expiredValue"]);
    expect(mine.rows).toEqual([{ item: "StockReportItem", unit: "tablet", usableQty: 30, expiredQty: 4, usableValue: 3000, expiredValue: 2000 }]);
    expect(mine.totals).toMatchObject({ item: "Total", usableQty: 30, expiredQty: 4, usableValue: 3000, expiredValue: 2000 });
    const all = await buildReport("stock", {});
    expect(all.rows.find((r) => r.item === "StockReportItem")).toMatchObject({ usableQty: 37, expiredQty: 4, usableValue: 3700 });
  });

  it("monthly consumption adds up what was issued, dispensed and written off, with value at cost", async () => {
    const w = await world();
    const it = await w.item("ConsumptionItem");
    await recv(w, { item: it.id, batchNo: "GOOD", expiry: addDays(TODAY, 200), qty: 100, cost: 250 });
    await recv(w, { item: it.id, batchNo: "OLD", expiry: addDays(TODAY, -3), qty: 6, cost: 250, today: LONG_AGO });
    await issue({ storeId: w.store.id, reason: "ward", actorUserId: w.keeper.id, lines: [{ itemId: it.id, quantity: 5 }] });
    await dispenseOne(w, it.id, 3);
    const oldBatch = (await db.batch.findFirstOrThrow({ where: { itemId: it.id, batchNo: "OLD" } })).id;
    await writeOff({ storeId: w.store.id, batchId: oldBatch, quantity: 2, actorUserId: w.admin.id, approvedBy: w.admin.id });

    const r = await buildReport("consumption", { storeId: w.store.id, months: 3 });
    const month = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
    expect(r.rows).toEqual([{ month, item: "ConsumptionItem", unit: "tablet", issued: 5, dispensed: 3, writtenOff: 2, consumption: 8, value: 2000 }]);
    expect(r.totals).toMatchObject({ month: "Total", issued: 5, dispensed: 3, writtenOff: 2, consumption: 8, value: 2000 });
  });

  it("monthly consumption keeps to the requested number of months", async () => {
    const w = await world();
    const it = await w.item("OldConsumption");
    await recv(w, { item: it.id, batchNo: "A", expiry: addDays(TODAY, 300), qty: 50, cost: 100 });
    const batchId = (await db.batch.findFirstOrThrow({ where: { itemId: it.id } })).id;
    // an issue from about 100 days ago, written straight into the ledger as history
    await db.stockMovement.create({ data: { type: "ISSUE", batchId, storeId: w.store.id, quantity: -4, actorUserId: w.keeper.id, reason: "old", at: istNoon(-100) } });
    const recent = await buildReport("consumption", { storeId: w.store.id, months: 1 });
    expect(recent.rows).toEqual([]);
    const wide = await buildReport("consumption", { storeId: w.store.id, months: 6 });
    expect(wide.rows).toHaveLength(1);
    expect(wide.rows[0]).toMatchObject({ issued: 4, consumption: 4, value: 400 });
    await expect(buildReport("consumption", { months: 0 })).rejects.toThrow(RangeError);
    await expect(buildReport("consumption", { months: 25 })).rejects.toThrow(RangeError);
  });

  it("ABC analysis ranks by consumption value and classes the items", async () => {
    const w = await world();
    const mk = async (name: string, qty: number, cost: number) => {
      const it = await w.item(name);
      await recv(w, { item: it.id, batchNo: "A", expiry: addDays(TODAY, 300), qty: qty + 5, cost });
      await dispenseOne(w, it.id, qty);
      return it;
    };
    await mk("AbcBig", 8, 100); // 800
    await mk("AbcMid", 3, 50); // 150
    await mk("AbcSmall", 1, 50); // 50
    const r = await buildReport("abc", { storeId: w.store.id, months: 12 });
    expect(r.rows.map((x) => [x.rank, x.item, x.value, x.class])).toEqual([
      [1, "AbcBig", 800, "A"],
      [2, "AbcMid", 150, "B"],
      [3, "AbcSmall", 50, "C"],
    ]);
    expect(r.rows.map((x) => x.cumulative)).toEqual([8000, 9500, 10000]);
    expect(r.totals).toMatchObject({ item: "Total", value: 1000 });
  });

  it("stock-out days count the days with nothing usable since the item was first stocked", async () => {
    const w = await world();
    const a = await w.item("OutDaysA");
    const b = await w.item("OutDaysB");
    const never = await w.item("OutDaysNever");
    const batch = (itemId: string, expiry: string, no: string) => db.batch.create({ data: { itemId, batchNo: no, expiryDate: new Date(`${expiry}T00:00:00Z`), mrpPaise: 1, costPaise: 1 } });
    const mv = async (batchId: string, qty: number, offset: number, type: "RECEIPT" | "ISSUE") =>
      db.stockMovement.create({ data: { seq: await nextSeq(db, "stockMovement"), type, batchId, storeId: w.store.id, quantity: qty, actorUserId: w.keeper.id, at: istNoon(offset) } });
    // A: +10 on day -6, all issued on day -4, +5 on day -1  => nothing on days -4, -3, -2
    const ba = await batch(a.id, addDays(TODAY, 300), "A1");
    await mv(ba.id, 10, -6, "RECEIPT");
    await mv(ba.id, -10, -4, "ISSUE");
    await mv(ba.id, 5, -1, "RECEIPT");
    // B: +10 on day -5 but the batch expired on day -2 => usable stock is 0 from day -1 on
    const bb = await batch(b.id, addDays(TODAY, -2), "B1");
    await mv(bb.id, 10, -5, "RECEIPT");
    void never;

    const r = await buildReport("stockout", { storeId: w.store.id, days: 7, today: TODAY });
    expect(r.columns.map((c) => c.key)).toEqual(["item", "unit", "firstStocked", "trackedDays", "stockoutDays", "stockoutBp", "outNow"]);
    expect(r.rows.map((x) => x.item).sort()).toEqual(["OutDaysA", "OutDaysB"]); // the never-stocked item is not listed
    expect(r.rows.find((x) => x.item === "OutDaysA")).toMatchObject({ firstStocked: addDays(TODAY, -6), trackedDays: 7, stockoutDays: 3, stockoutBp: 4286, outNow: "No" });
    expect(r.rows.find((x) => x.item === "OutDaysB")).toMatchObject({ firstStocked: addDays(TODAY, -5), trackedDays: 6, stockoutDays: 2, stockoutBp: 3333, outNow: "Yes" });
    expect(r.rows[0]!.item).toBe("OutDaysA"); // most days first
    await expect(buildReport("stockout", { days: 0 })).rejects.toThrow(RangeError);
    await expect(buildReport("stockout", { days: 400 })).rejects.toThrow(RangeError);
  });

  it("the expiry report lists near-expiry stock with its value and band", async () => {
    const w = await world();
    const it = await w.item("ExpiryReportItem");
    await recv(w, { item: it.id, batchNo: "SOON", expiry: addDays(TODAY, 20), qty: 3, cost: 700 });
    const r = await buildReport("expiry", { storeId: w.store.id });
    expect(r.rows).toEqual([expect.objectContaining({ item: "ExpiryReportItem", batch: "SOON", daysLeft: 20, quantity: 3, value: 2100, band: "Within 30 days" })]);
    expect(r.totals).toMatchObject({ value: 2100 });
  });

  it.skipIf(isSqlite)("reads from the SQL views", async () => {
    const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT (SELECT count(*) FROM report_stock_on_hand) + (SELECT count(*) FROM report_consumption) AS n`;
    expect(Number(rows[0]!.n)).toBeGreaterThanOrEqual(0);
  });
});

// ---------- nightly job and email ----------
describe("nightly alert job and the email digest", () => {
  const config = { to: ["a@example.org", "b@example.org"], from: "stocksafe@example.org", appUrl: "http://hospital.local:3002" };
  type Sent = { to?: string | string[]; from?: string; subject?: string; text?: string; html?: string };

  it("sends one digest to everyone on the list and records the run in the audit log", async () => {
    const w = await world();
    const it = await w.item("DigestItem <b>");
    await recv(w, { item: it.id, batchNo: "SOON", expiry: addDays(TODAY, 10), qty: 5, cost: 100 });
    const sent: Sent[] = [];
    const r = await runAlertJob({ transport: { sendMail: async (m: Sent) => void sent.push(m) }, config });
    expect(r.digest).toEqual({ status: "sent" });
    expect(r.date).toBe(TODAY);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: "stocksafe@example.org", to: ["a@example.org", "b@example.org"] });
    expect(sent[0]!.subject).toMatch(/^(\[Action needed\] )?StockSafe daily digest: .+, \d{4}-\d{2}-\d{2}$/);
    expect(sent[0]!.text).toContain("Within 30 days");
    expect(sent[0]!.html).toContain("http://hospital.local:3002/expiry");
    const audit = (await listAudit({ action: "ALERT_JOB_RUN", pageSize: 3 })).rows;
    expect(audit[0]).toMatchObject({ entity: "job", actorName: null });
  });

  it("skips the email quietly when email is not set up, but still runs", async () => {
    const r = await runAlertJob({ transport: null, config: { ...config, to: [] } });
    expect(r.digest).toEqual({ status: "skipped" });
    const r2 = await runAlertJob({ transport: { sendMail: async () => { throw new Error("must not be called"); } }, config: { ...config, to: [] } });
    expect(r2.digest.status).toBe("skipped");
  });

  it("a failing mail server is logged and audited but never crashes the job", async () => {
    const r = await runAlertJob({ transport: { sendMail: async () => { throw new Error("connect ECONNREFUSED 10.0.0.9:25"); } }, config });
    expect(r.digest).toEqual({ status: "failed", error: "connect ECONNREFUSED 10.0.0.9:25" });
    expect((await listAudit({ action: "DIGEST_FAILED", pageSize: 1 })).rows).toHaveLength(1);
  });

  it("works over a real SMTP conversation", async () => {
    const received: string[] = [];
    const server = new SMTPServer({
      authOptional: true,
      disabledCommands: ["STARTTLS", "AUTH"],
      onData(stream, _session, done) {
        let raw = "";
        stream.on("data", (c: Buffer) => (raw += c.toString("utf8")));
        stream.on("end", () => {
          received.push(raw);
          done();
        });
      },
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.server.address() as AddressInfo).port;
      const w = await world();
      const it = await w.item("SmtpItem");
      await recv(w, { item: it.id, batchNo: "SOON", expiry: addDays(TODAY, 5), qty: 2, cost: 100 });
      const r = await runAlertJob({ transport: createMailTransport(`smtp://127.0.0.1:${port}`), config });
      expect(r.digest).toEqual({ status: "sent" });
      expect(received).toHaveLength(1);
      expect(received[0]).toMatch(/Subject: .*StockSafe daily digest/i);
      expect(received[0]).toMatch(/a@example\.org/);
      expect(received[0]).toMatch(/b@example\.org/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
