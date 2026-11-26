// The five reports. Each reads from SQL views over the ledger (report_stock_on_hand, report_consumption) or,
// for stock-out days, straight from the ledger. Every report is built as a `Report` and can then be shown,
// downloaded as CSV, or rendered as PDF without any further queries.

import { Prisma } from "@prisma/client";
import { abcClassify } from "@/lib/abc";
import { expiryBands, getExpiryList } from "@/lib/alerts";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/fefo";
import type { Report, ReportRow } from "@/lib/report-format";

export const REPORT_NAMES = ["stock", "expiry", "consumption", "abc", "stockout"] as const;
export type ReportName = (typeof REPORT_NAMES)[number];
export const isReportName = (s: string): s is ReportName => (REPORT_NAMES as readonly string[]).includes(s);

export type ReportParams = {
  storeId?: string;
  /** consumption and ABC: how many calendar months to look back (this month counts as 1). */
  months?: number;
  /** stock-out days: how many days to look back, ending today. */
  days?: number;
  /** Override today's date (YYYY-MM-DD), for tests. */
  today?: string;
};

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
const label = (name: string, strength: string | null) => (strength ? `${name} ${strength}` : name);
const addDays = (day: string, k: number) => new Date(Date.parse(`${day}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);

function intParam(v: number | undefined, def: number, min: number, max: number, what: string): number {
  const x = v ?? def;
  if (!Number.isInteger(x) || x < min || x > max) throw new RangeError(`${what} must be a whole number from ${min} to ${max}`);
  return x;
}

/** First day of the month `months - 1` months before the month of `today`. */
function firstMonth(today: string, months: number): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 - (months - 1);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

async function storeName(storeId?: string): Promise<string> {
  if (!storeId) return "All stores";
  return (await db.store.findUnique({ where: { id: storeId }, select: { name: true } }))?.name ?? "Unknown store";
}

export async function buildReport(name: ReportName, p: ReportParams = {}): Promise<Report> {
  const today = p.today ?? todayIST();
  const where = await storeName(p.storeId);
  switch (name) {
    case "stock":
      return stockReport(p, today, where);
    case "expiry":
      return expiryReport(p, today, where);
    case "consumption":
      return consumptionReport(p, today, where);
    case "abc":
      return abcReport(p, today, where);
    case "stockout":
      return stockoutReport(p, today, where);
  }
}

// ---------- stock on hand ----------
async function stockReport(p: ReportParams, today: string, where: string): Promise<Report> {
  const storeF = p.storeId ? Prisma.sql`AND store_id = ${p.storeId}` : Prisma.empty;
  const raw = await db.$queryRaw<
    { itemName: string; strength: string | null; unit: string; usableQty: bigint; expiredQty: bigint; usableValue: bigint; expiredValue: bigint }[]
  >`
    SELECT item_name AS "itemName", strength, unit,
           COALESCE(SUM(quantity) FILTER (WHERE expiry_date >= ${today}::date), 0)::bigint AS "usableQty",
           COALESCE(SUM(quantity) FILTER (WHERE expiry_date < ${today}::date), 0)::bigint AS "expiredQty",
           COALESCE(SUM(value_paise) FILTER (WHERE expiry_date >= ${today}::date), 0)::bigint AS "usableValue",
           COALESCE(SUM(value_paise) FILTER (WHERE expiry_date < ${today}::date), 0)::bigint AS "expiredValue"
    FROM report_stock_on_hand
    WHERE quantity > 0 ${storeF}
    GROUP BY item_id, item_name, strength, unit
    ORDER BY item_name, strength NULLS FIRST`;
  const rows: ReportRow[] = raw.map((r) => ({
    item: label(r.itemName, r.strength),
    unit: r.unit,
    usableQty: n(r.usableQty),
    expiredQty: n(r.expiredQty),
    usableValue: n(r.usableValue),
    expiredValue: n(r.expiredValue),
  }));
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  return {
    name: "stock",
    title: "Stock on hand",
    subtitle: `${where}, as of ${today}`,
    columns: [
      { key: "item", label: "Item", kind: "text" },
      { key: "unit", label: "Unit", kind: "text" },
      { key: "usableQty", label: "Usable quantity", kind: "int" },
      { key: "expiredQty", label: "Expired quantity", kind: "int" },
      { key: "usableValue", label: "Usable value (at cost)", kind: "paise" },
      { key: "expiredValue", label: "Expired value (at cost)", kind: "paise" },
    ],
    rows,
    totals: { item: "Total", unit: null, usableQty: sum("usableQty"), expiredQty: sum("expiredQty"), usableValue: sum("usableValue"), expiredValue: sum("expiredValue") },
    notes: ["Usable stock is not yet expired. Values are quantity times the batch's cost price."],
  };
}

// ---------- near-expiry / expired ----------
async function expiryReport(p: ReportParams, today: string, where: string): Promise<Report> {
  const data = await getExpiryList({ storeId: p.storeId, today });
  const bandLabel = new Map(data.bands.map((b) => [b.key, b.label]));
  const rows: ReportRow[] = data.rows.map((r) => ({
    store: r.storeName,
    item: label(r.itemName, r.strength),
    batch: r.batchNo,
    expiry: r.expiryDate,
    daysLeft: r.daysLeft,
    quantity: r.quantity,
    value: r.valuePaise,
    band: bandLabel.get(r.band) ?? r.band,
  }));
  return {
    name: "expiry",
    title: "Expired and near-expiry stock",
    subtitle: `${where}, as of ${today}, within ${expiryBands().at(-1)!.maxDays} days`,
    columns: [
      { key: "store", label: "Store", kind: "text" },
      { key: "item", label: "Item", kind: "text" },
      { key: "batch", label: "Batch", kind: "text" },
      { key: "expiry", label: "Expiry", kind: "date" },
      { key: "daysLeft", label: "Days left", kind: "int" },
      { key: "quantity", label: "Quantity", kind: "int" },
      { key: "value", label: "Value (at cost)", kind: "paise" },
      { key: "band", label: "Band", kind: "text" },
    ],
    rows,
    totals: { store: "Total", item: null, batch: null, expiry: null, daysLeft: null, quantity: rows.reduce((s, r) => s + Number(r.quantity), 0), value: rows.reduce((s, r) => s + Number(r.value), 0), band: null },
    notes: ["Days left is negative for stock that has already expired."],
    truncated: data.truncated,
  };
}

// ---------- monthly consumption ----------
async function consumptionReport(p: ReportParams, today: string, where: string): Promise<Report> {
  const months = intParam(p.months, 6, 1, 24, "months");
  const from = firstMonth(today, months);
  const storeF = p.storeId ? Prisma.sql`AND c.store_id = ${p.storeId}` : Prisma.empty;
  const raw = await db.$queryRaw<
    { month: string; name: string; strength: string | null; unit: string; issued: bigint; dispensed: bigint; writtenOff: bigint; value: bigint }[]
  >`
    SELECT to_char(c.month, 'YYYY-MM') AS month, i.name, i.strength, i.unit,
           SUM(c.qty_issued)::bigint AS issued, SUM(c.qty_dispensed)::bigint AS dispensed,
           SUM(c.qty_written_off)::bigint AS "writtenOff", SUM(c.value_consumed_paise)::bigint AS value
    FROM report_consumption c JOIN item i ON i.id = c.item_id
    WHERE c.month >= ${from}::date ${storeF}
    GROUP BY c.month, i.id, i.name, i.strength, i.unit
    ORDER BY c.month DESC, SUM(c.value_consumed_paise) DESC, i.name`;
  const rows: ReportRow[] = raw.map((r) => ({
    month: r.month,
    item: label(r.name, r.strength),
    unit: r.unit,
    issued: n(r.issued),
    dispensed: n(r.dispensed),
    writtenOff: n(r.writtenOff),
    consumption: n(r.issued) + n(r.dispensed),
    value: n(r.value),
  }));
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  return {
    name: "consumption",
    title: "Monthly consumption",
    subtitle: `${where}, last ${months} month${months === 1 ? "" : "s"} (from ${from.slice(0, 7)})`,
    columns: [
      { key: "month", label: "Month", kind: "text" },
      { key: "item", label: "Item", kind: "text" },
      { key: "unit", label: "Unit", kind: "text" },
      { key: "issued", label: "Issued", kind: "int" },
      { key: "dispensed", label: "Dispensed", kind: "int" },
      { key: "writtenOff", label: "Written off (expired)", kind: "int" },
      { key: "consumption", label: "Consumption", kind: "int" },
      { key: "value", label: "Consumption value (at cost)", kind: "paise" },
    ],
    rows,
    totals: { month: "Total", item: null, unit: null, issued: sum("issued"), dispensed: sum("dispensed"), writtenOff: sum("writtenOff"), consumption: sum("consumption"), value: sum("value") },
    notes: ["Consumption = issued + dispensed. Transfers between stores are not consumption. Written-off stock is shown separately and is not in the value."],
  };
}

// ---------- ABC analysis ----------
async function abcReport(p: ReportParams, today: string, where: string): Promise<Report> {
  const months = intParam(p.months, 12, 1, 24, "months");
  const from = firstMonth(today, months);
  const storeF = p.storeId ? Prisma.sql`AND c.store_id = ${p.storeId}` : Prisma.empty;
  const raw = await db.$queryRaw<{ id: string; name: string; strength: string | null; unit: string; qty: bigint; value: bigint }[]>`
    SELECT i.id, i.name, i.strength, i.unit,
           SUM(c.qty_issued + c.qty_dispensed)::bigint AS qty, SUM(c.value_consumed_paise)::bigint AS value
    FROM report_consumption c JOIN item i ON i.id = c.item_id
    WHERE c.month >= ${from}::date ${storeF}
    GROUP BY i.id, i.name, i.strength, i.unit
    HAVING SUM(c.value_consumed_paise) > 0`;
  const byId = new Map(raw.map((r) => [r.id, r]));
  const ranked = abcClassify(raw.map((r) => ({ id: r.id, name: label(r.name, r.strength), value: n(r.value) })));
  const rows: ReportRow[] = ranked.map((a) => {
    const r = byId.get(a.id)!;
    return { rank: a.rank, item: label(r.name, r.strength), unit: r.unit, quantity: n(r.qty), value: a.value, share: a.shareBp, cumulative: a.cumulativeBp, class: a.class };
  });
  return {
    name: "abc",
    title: "ABC analysis",
    subtitle: `${where}, consumption value over the last ${months} month${months === 1 ? "" : "s"}`,
    columns: [
      { key: "rank", label: "Rank", kind: "int" },
      { key: "item", label: "Item", kind: "text" },
      { key: "unit", label: "Unit", kind: "text" },
      { key: "quantity", label: "Quantity consumed", kind: "int" },
      { key: "value", label: "Consumption value (at cost)", kind: "paise" },
      { key: "share", label: "Share", kind: "percent_bp" },
      { key: "cumulative", label: "Cumulative", kind: "percent_bp" },
      { key: "class", label: "Class", kind: "text" },
    ],
    rows,
    totals: { rank: null, item: "Total", unit: null, quantity: rows.reduce((s, r) => s + Number(r.quantity), 0), value: rows.reduce((s, r) => s + Number(r.value), 0), share: null, cumulative: null, class: null },
    notes: [
      "A items are the few that make up the first 80% of consumption value, B the next 15%, C the rest. Spend the most care on A items.",
      "Items with no consumption in the period are not listed.",
    ],
  };
}

// ---------- stock-out days ----------
async function stockoutReport(p: ReportParams, today: string, where: string): Promise<Report> {
  const days = intParam(p.days, 90, 1, 366, "days");
  const from = addDays(today, -(days - 1));
  const storeF = p.storeId ? Prisma.sql`AND m.store_id = ${p.storeId}` : Prisma.empty;
  // For each item and each day: usable stock at the end of that day = every movement up to that day, counting only
  // batches that had not expired by then. A stock-out day is a day with nothing usable, counted from the day the item
  // was first stocked.
  const raw = await db.$queryRaw<
    { name: string; strength: string | null; unit: string; firstDay: Date; tracked: bigint; stockout: bigint; outNow: boolean | null }[]
  >`
    WITH days AS (
      SELECT gs::date AS d FROM generate_series(${from}::date, ${today}::date, interval '1 day') gs
    ),
    deltas AS (
      SELECT b.item_id, m.batch_id, b.expiry_date, (m."at" AT TIME ZONE 'Asia/Kolkata')::date AS day, SUM(m.quantity)::int AS q
      FROM stock_movement m JOIN batch b ON b.id = m.batch_id
      WHERE true ${storeF}
      GROUP BY b.item_id, m.batch_id, b.expiry_date, (m."at" AT TIME ZONE 'Asia/Kolkata')::date
    ),
    firsts AS (
      SELECT item_id, MIN(day) FILTER (WHERE q > 0) AS first_day FROM deltas GROUP BY item_id
    ),
    usable AS (
      SELECT dl.item_id, dy.d, COALESCE(SUM(dl.q) FILTER (WHERE dl.expiry_date >= dy.d), 0) AS usable
      FROM days dy JOIN deltas dl ON dl.day <= dy.d
      GROUP BY dl.item_id, dy.d
    )
    SELECT i.name, i.strength, i.unit, f.first_day AS "firstDay",
           COUNT(*)::bigint AS tracked,
           (COUNT(*) FILTER (WHERE u.usable <= 0))::bigint AS stockout,
           BOOL_OR(u.usable <= 0) FILTER (WHERE u.d = ${today}::date) AS "outNow"
    FROM usable u
    JOIN firsts f ON f.item_id = u.item_id
    JOIN item i ON i.id = u.item_id
    WHERE f.first_day IS NOT NULL AND u.d >= f.first_day
    GROUP BY i.id, i.name, i.strength, i.unit, f.first_day
    HAVING COUNT(*) FILTER (WHERE u.usable <= 0) > 0
    ORDER BY stockout DESC, i.name`;
  const rows: ReportRow[] = raw.map((r) => ({
    item: label(r.name, r.strength),
    unit: r.unit,
    firstStocked: r.firstDay.toISOString().slice(0, 10),
    trackedDays: n(r.tracked),
    stockoutDays: n(r.stockout),
    stockoutBp: Math.round((n(r.stockout) * 10000) / Math.max(1, n(r.tracked))),
    outNow: r.outNow ? "Yes" : "No",
  }));
  return {
    name: "stockout",
    title: "Stock-out days",
    subtitle: `${where}, last ${days} day${days === 1 ? "" : "s"} (${from} to ${today})`,
    columns: [
      { key: "item", label: "Item", kind: "text" },
      { key: "unit", label: "Unit", kind: "text" },
      { key: "firstStocked", label: "First stocked", kind: "date" },
      { key: "trackedDays", label: "Days tracked", kind: "int" },
      { key: "stockoutDays", label: "Days with nothing usable", kind: "int" },
      { key: "stockoutBp", label: "Share of days", kind: "percent_bp" },
      { key: "outNow", label: "Out today", kind: "text" },
    ],
    rows,
    totals: null,
    notes: [
      "A stock-out day is a day that ended with no usable (non-expired) stock. Days before an item was first stocked are not counted.",
      "Only items with at least one stock-out day are listed.",
    ],
  };
}
