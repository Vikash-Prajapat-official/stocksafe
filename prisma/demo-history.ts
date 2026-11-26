// Six months of believable synthetic history, so the demo dashboard looks real (SPEC section 9).
//
// It does NOT write rows by hand: it plays the six months forward through the same functions the app uses
// (receive, transfer, dispense, issueIndent, writeOff, applyCount), one day at a time, with the clock set to that
// day (src/lib/clock.ts). So the ledger, the balances and the audit log all agree, the append-only rules were never
// bypassed, and a failure (such as running out of stock) happens exactly as it would for a real user.
//
// What the history contains: weekly goods receipts, store-to-pharmacy and store-to-ward transfers, daily OPD
// dispensing with patient tokens, ward indents, one stock count with small differences, a few items that ran out
// for weeks (stock-outs), batches that are close to expiry today, batches that have already expired, and a few
// write-offs. It is deterministic: the same seed gives the same history.

import type { PrismaClient } from "@prisma/client";
import { withMovementTime } from "../src/lib/clock";
import { applyCount, dispense, issueIndent, receive, transfer, writeOff, StockError } from "../src/lib/stock";
import { approveIndent, createIndent } from "../src/lib/indents";
import { saveCountLines, startCount, submitCount } from "../src/lib/counts";
import { todayIST } from "../src/lib/fefo";
import type { SessionUser } from "../src/lib/session";

const DAYS = 180;

// small deterministic random numbers (mulberry32)
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** 10:30 India time on that day. */
const at = (day: string) => new Date(`${day}T05:00:00Z`);

export async function seedDemoHistory(prisma: PrismaClient, log: (m: string) => void = console.log) {
  if ((await prisma.stockMovement.count()) > 0) {
    log("Demo history skipped: the ledger already has movements.");
    return;
  }
  const rand = rng(20261127);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

  const [stores, users, suppliers] = await Promise.all([
    prisma.store.findMany(),
    prisma.user.findMany(),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);
  const store = (name: string) => stores.find((s) => s.name === name)!;
  const user = (role: string) => users.find((u) => u.role === role)!;
  const main = store("Main Store"), pharmacy = store("Pharmacy"), ward = store("Ward A");
  const asSession = (u: { id: string; name: string; role: string }) => ({ id: u.id, name: u.name, role: u.role }) as SessionUser;
  const keeper = user("STOREKEEPER"), pharmacist = user("PHARMACIST"), nurse = user("NURSE"), admin = user("ADMIN");

  // ---- which items take part: every 5th item of the usual forms
  const all = await prisma.item.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const items = all.filter((i, n) => n % 5 === 0 && ["TABLET", "CAPSULE", "SYRUP", "INJECTION", "CONSUMABLE"].includes(i.form)).slice(0, 70);
  const demand = new Map<string, number>(); // units a day through the pharmacy
  const cost = new Map<string, number>();
  for (const it of items) {
    const base = it.form === "TABLET" || it.form === "CAPSULE" ? between(8, 40) : it.form === "SYRUP" ? between(1, 4) : it.form === "INJECTION" ? between(2, 8) : between(3, 12);
    demand.set(it.id, rand() < 0.2 ? base * 2 : base);
    const hash = [...it.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    cost.set(it.id, 100 + (hash % 4900)); // paise
  }
  const popular = items.slice();
  const stockoutItems = items.slice(3, 9); // run dry for weeks, and two of them are out right now
  const stillOut = new Set(stockoutItems.slice(0, 2).map((i) => i.id));
  const slow = items.slice(20, 32); // hardly used: they sit on the shelf and expire
  const slowSet = new Set(slow.map((i) => i.id));

  // reorder levels the admin would have set (so the reorder list and the stock-out report mean something)
  for (const it of items) {
    const d = demand.get(it.id)!;
    await prisma.item.update({ where: { id: it.id }, data: { minLevel: d * 7, reorderLevel: d * 14, maxLevel: d * 45 } });
  }

  const today = todayIST();
  let invoice = 1000;
  let batchSeq = 1;

  const receiveFor = async (day: string, list: { itemId: string; qty: number; expiryDays: number }[]) => {
    if (!list.length) return;
    await withMovementTime(at(day), () =>
      receive(
        {
          storeId: main.id,
          supplierId: pick(suppliers).id,
          invoiceNo: `INV-${invoice++}`,
          invoiceDate: day,
          actorUserId: keeper.id,
          lines: list.map((l) => ({
            itemId: l.itemId,
            batchNo: `B${day.slice(2, 4)}${day.slice(5, 7)}${String(batchSeq++).padStart(3, "0")}`,
            expiryDate: addDays(day, l.expiryDays),
            quantity: l.qty,
            costPaise: cost.get(l.itemId)!,
            mrpPaise: Math.round(cost.get(l.itemId)! * 1.25),
          })),
        },
        { today: day },
      ),
    );
  };

  /** On-hand per item in one store, from the real balances. */
  const onHand = async (storeId: string) => {
    const rows = await prisma.stockBalance.findMany({ where: { storeId, quantity: { gt: 0 } }, include: { batch: { select: { itemId: true } } } });
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.batch.itemId, (m.get(r.batch.itemId) ?? 0) + r.quantity);
    return m;
  };

  const stats = { receipts: 0, transfers: 0, dispenses: 0, shortfalls: 0, indents: 0 };
  const start = addDays(today, -DAYS);

  for (let n = 0; n <= DAYS; n++) {
    const day = addDays(start, n);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
    const daysToEnd = DAYS - n;

    // ---- goods receipts
    if (n === 0) {
      // opening stock; a few batches are deliberately short-dated so they are near expiry or expired by today
      await receiveFor(day, items.map((it) => {
        const d = demand.get(it.id)!;
        const slowBatch = slowSet.has(it.id);
        const expiryDays = slowBatch ? DAYS - 40 + between(-30, 70) : between(300, 700); // slow items land from 30 days ago to 70 days ahead
        return { itemId: it.id, qty: slowBatch ? 400 : d * 50, expiryDays };
      }));
    } else if (dow === 1) {
      const have = await onHand(main.id);
      const list = items
        .filter((it) => {
          if (slowSet.has(it.id)) return false;
          if (stockoutItems.includes(it) && n > 55 && n < 120) return false; // supplier problem: nothing arrives for ~9 weeks
          if (stillOut.has(it.id) && daysToEnd < 30) return false; // and these two never recovered
          return (have.get(it.id) ?? 0) < demand.get(it.id)! * 40;
        })
        .map((it) => ({ itemId: it.id, qty: demand.get(it.id)! * between(40, 60), expiryDays: rand() < 0.15 ? between(130, 220) : between(330, 720) }));
      await receiveFor(day, list);
      if (list.length) stats.receipts++;
    }

    // ---- main store -> pharmacy, every second day
    if (n > 0 && n % 2 === 0) {
      const have = await onHand(pharmacy.id);
      const lines = popular.filter((it) => (have.get(it.id) ?? 0) < demand.get(it.id)! * 6).map((it) => ({ itemId: it.id, quantity: demand.get(it.id)! * 12 }));
      for (const l of lines) {
        try {
          await withMovementTime(at(day), () => transfer({ fromStoreId: main.id, toStoreId: pharmacy.id, lines: [l], actorUserId: keeper.id, reason: "Pharmacy top-up" }, { today: day }));
          stats.transfers++;
        } catch (e) {
          if (!(e instanceof StockError)) throw e; // the main store was short: the pharmacy waits
        }
      }
    }

    // ---- daily OPD dispensing (quieter on Sunday)
    if (n > 0) {
      const visits = dow === 0 ? between(4, 8) : between(14, 28);
      for (let v = 0; v < visits; v++) {
        const lines = Array.from({ length: between(1, 3) }, () => pick(popular)).filter((it, i, a) => a.findIndex((x) => x.id === it.id) === i && !slowSet.has(it.id)).map((it) => {
          const d = demand.get(it.id)!;
          const per = it.form === "TABLET" || it.form === "CAPSULE" ? between(6, 20) : between(1, Math.max(1, Math.ceil(d / 6)));
          return { itemId: it.id, quantity: per };
        });
        if (!lines.length) continue;
        try {
          await withMovementTime(at(day), () => dispense({ storeId: pharmacy.id, lines, actorUserId: pharmacist.id, patientLabel: `OPD ${day.slice(5).replace("-", "")}-${v + 1}` }, { today: day }));
          stats.dispenses++;
        } catch (e) {
          if (!(e instanceof StockError)) throw e;
          stats.shortfalls++; // a patient asked for something the pharmacy did not have
        }
      }
      // slow items: now and then a single dispense
      if (rand() < 0.3) {
        const it = pick(slow);
        try {
          await withMovementTime(at(day), () => dispense({ storeId: pharmacy.id, lines: [{ itemId: it.id, quantity: 1 }], actorUserId: pharmacist.id }, { today: day }));
        } catch (e) {
          if (!(e instanceof StockError)) throw e;
        }
      }
    }

    // ---- a ward indent every 10 days: nurse asks, keeper approves, keeper issues
    if (n > 5 && n % 10 === 0) {
      try {
        const chosen = Array.from(new Set(Array.from({ length: between(3, 5) }, () => pick(popular).id)));
        await withMovementTime(at(day), async () => {
          const ind = await createIndent({ user: asSession(nurse), fromStoreId: ward.id, toStoreId: main.id, lines: chosen.map((id) => ({ itemId: id, quantity: between(20, 60) })), submit: true });
          await approveIndent({ user: asSession(keeper), id: ind.id });
          await issueIndent({ indentId: ind.id, actorUserId: keeper.id }, { today: day });
        });
        stats.indents++;
      } catch (e) {
        if (!(e instanceof StockError)) throw e;
      }
    }

    // ---- one stock count of the pharmacy, 25 days ago, with a few small differences
    if (n === DAYS - 25) {
      await withMovementTime(at(day), async () => {
        const c = await startCount({ user: asSession(pharmacist), storeId: pharmacy.id });
        const full = await prisma.stockCountLine.findMany({ where: { countId: c.id }, take: 40 });
        await saveCountLines({
          user: asSession(pharmacist),
          id: c.id,
          lines: full.map((l, i) => ({ lineId: l.id, countedQty: i % 7 === 0 ? Math.max(0, l.systemQty - between(1, 5)) : l.systemQty })),
        });
        await submitCount({ user: asSession(pharmacist), id: c.id });
        await applyCount({ countId: c.id, approverId: admin.id });
      });
    }

    // ---- the admin writes off some expired stock, 5 days ago (not all of it: the dashboard still shows some)
    if (n === DAYS - 5) {
      const expired = await prisma.stockBalance.findMany({
        where: { quantity: { gt: 0 }, batch: { expiryDate: { lt: new Date(`${day}T00:00:00Z`) } } },
        include: { batch: true },
        take: 3,
        orderBy: { batch: { expiryDate: "asc" } },
      });
      for (const b of expired) {
        await withMovementTime(at(day), () => writeOff({ storeId: b.storeId, batchId: b.batchId, quantity: b.quantity, actorUserId: keeper.id, approvedBy: admin.id }, { today: day }));
      }
    }
  }

  log(
    `Demo history: ${DAYS} days played forward: ${stats.receipts} goods receipts, ${stats.transfers} transfers, ${stats.dispenses} dispensings ` +
      `(${stats.shortfalls} turned away for lack of stock), ${stats.indents} ward indents, 1 stock count.`,
  );
}
