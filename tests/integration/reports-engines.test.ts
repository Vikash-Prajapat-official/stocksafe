import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isSqlite } from "@/lib/dialect";
import { todayIST } from "@/lib/fefo";
import { buildReport, REPORT_NAMES } from "@/lib/reports";
import { nextSeq } from "@/lib/seq";
import { dispense, issue, receive, writeOff } from "@/lib/stock";

// The SQL engine (PostgreSQL views) and the JS engine (used on SQLite) must agree exactly.
// Only meaningful on PostgreSQL, because SQLite has no SQL engine to compare with.
const maybe = isSqlite ? describe.skip : describe;

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TODAY = todayIST();
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const istNoon = (offset: number) => new Date(`${addDays(TODAY, offset)}T06:30:00Z`);

afterAll(() => db.$disconnect());

maybe("report engines agree", () => {
  it("gives identical results for every report on realistic data", async () => {
    const mk = (role: "ADMIN" | "STOREKEEPER" | "PHARMACIST") => db.user.create({ data: { name: role, phone: uid(), passwordHash: "x", role } });
    const [admin, keeper, pharmacist] = await Promise.all([mk("ADMIN"), mk("STOREKEEPER"), mk("PHARMACIST")]);
    const store = await db.store.create({ data: { name: `Store-${uid()}`, type: "MAIN" } });
    const other = await db.store.create({ data: { name: `Other-${uid()}`, type: "PHARMACY" } });
    const supplier = await db.supplier.create({ data: { name: `Sup-${uid()}` } });
    const item = (name: string, strength: string | null = null) => db.item.create({ data: { name: `${name}-${uid()}`, strength, form: "TABLET", unit: "tablet" } });
    const [a, b, c, d] = await Promise.all([item("EngA", "5 mg"), item("EngB"), item("EngC", "1 g"), item("EngD")]);

    const recv = (storeId: string, itemId: string, batchNo: string, expiry: string, qty: number, cost: number, today?: string) =>
      receive(
        { storeId, supplierId: supplier.id, invoiceNo: `I-${uid()}`, invoiceDate: TODAY, actorUserId: keeper.id, lines: [{ itemId, batchNo, expiryDate: expiry, quantity: qty, mrpPaise: cost * 2, costPaise: cost }] },
        today ? { today } : undefined,
      );
    await recv(store.id, a.id, "A1", addDays(TODAY, 300), 100, 120);
    await recv(store.id, a.id, "A2", addDays(TODAY, 40), 30, 100);
    await recv(store.id, b.id, "B1", addDays(TODAY, 200), 60, 250);
    await recv(store.id, c.id, "C1", addDays(TODAY, -3), 9, 700, addDays(TODAY, -400)); // already expired
    await recv(store.id, c.id, "C2", addDays(TODAY, 90), 20, 700);
    await recv(other.id, a.id, "A1", addDays(TODAY, 300), 15, 120);
    await recv(other.id, b.id, "B1", addDays(TODAY, 200), 5, 250);

    await issue({ storeId: store.id, reason: "ward", actorUserId: keeper.id, lines: [{ itemId: a.id, quantity: 20 }, { itemId: b.id, quantity: 7 }] });
    await dispense({ storeId: store.id, actorUserId: pharmacist.id, lines: [{ itemId: a.id, quantity: 11 }, { itemId: c.id, quantity: 4 }] });
    await dispense({ storeId: other.id, actorUserId: pharmacist.id, lines: [{ itemId: b.id, quantity: 2 }] });
    const old = await db.batch.findFirstOrThrow({ where: { itemId: c.id, batchNo: "C1" } });
    await writeOff({ storeId: store.id, batchId: old.id, quantity: 5, actorUserId: admin.id, approvedBy: admin.id });

    // history written straight into the ledger (backdated), including a full stock-out and an expiry stock-out
    const batch = (itemId: string, expiry: string, no: string) => db.batch.create({ data: { itemId, batchNo: no, expiryDate: new Date(`${expiry}T00:00:00Z`), mrpPaise: 2, costPaise: 90 } });
    const mv = async (batchId: string, qty: number, offset: number, type: "RECEIPT" | "ISSUE" | "DISPENSE") =>
      db.stockMovement.create({ data: { seq: await nextSeq(db, "stockMovement"), type, batchId, storeId: store.id, quantity: qty, actorUserId: keeper.id, at: istNoon(offset) } });
    const bd = await batch(d.id, addDays(TODAY, 300), "D1");
    await mv(bd.id, 10, -20, "RECEIPT");
    await mv(bd.id, -10, -12, "ISSUE");
    await mv(bd.id, 6, -5, "RECEIPT");
    const be = await batch(d.id, addDays(TODAY, -2), "D2");
    await mv(be.id, 8, -9, "RECEIPT");
    await mv(be.id, -3, -4, "ISSUE");

    // scoped to this test's own stores: other test files write to the shared database at the same time, which would race two un-scoped queries
    const params = [{ storeId: store.id }, { storeId: other.id }] as const;
    for (const name of REPORT_NAMES) {
      if (name === "expiry") continue; // one shared implementation
      for (const p of params) {
        const sql = await buildReport(name, { ...p, engine: "sql" });
        const js = await buildReport(name, { ...p, engine: "js" });
        // PostgreSQL orders names by its collation and JS by code point, so rows with equal sort keys may swap: compare as sets
        const canon = (r: typeof sql) => ({ ...r, rows: [...r.rows].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))) });
        expect(canon(js), `${name} ${JSON.stringify(p)}`).toEqual(canon(sql));
      }
    }
    // the interesting ones must not be empty, or the comparison proves nothing
    const so = await buildReport("stockout", { storeId: store.id, engine: "js" });
    expect(so.rows.some((r) => String(r.item).startsWith("EngD"))).toBe(true);
    const cons = await buildReport("consumption", { storeId: store.id, engine: "js", months: 6 });
    expect(cons.rows.length).toBeGreaterThanOrEqual(3);
    const abc = await buildReport("abc", { storeId: store.id, engine: "js" });
    expect(abc.rows.length).toBeGreaterThanOrEqual(3);
    const stock = await buildReport("stock", { storeId: store.id, engine: "js" });
    expect(stock.rows.some((r) => Number(r.expiredQty) > 0)).toBe(true);
    for (const days of [7, 30, 90, 366]) {
      expect(await buildReport("stockout", { storeId: store.id, engine: "js", days })).toEqual(await buildReport("stockout", { storeId: store.id, engine: "sql", days }));
    }
    for (const months of [1, 3, 12, 24]) {
      expect(await buildReport("consumption", { storeId: store.id, engine: "js", months })).toEqual(await buildReport("consumption", { storeId: store.id, engine: "sql", months }));
      expect(await buildReport("abc", { storeId: store.id, engine: "js", months })).toEqual(await buildReport("abc", { storeId: store.id, engine: "sql", months }));
    }
  });
});
