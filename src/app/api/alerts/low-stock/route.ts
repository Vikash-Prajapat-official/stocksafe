import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getLowStock } from "@/lib/alerts";
import { toCsv } from "@/lib/csv";

// Items below their reorder level with the suggested order quantity (maximum - on-hand).
// ?store=<id> for one store, ?format=csv to download.
export const GET = route("ANY", async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const rows = await getLowStock({ storeId: sp.get("store") ?? undefined });
  if (sp.get("format") === "csv") {
    const csv = toCsv(
      ["Item", "Strength", "Unit", "Status", "On hand (usable)", "Expired (not counted)", "Minimum", "Reorder level", "Maximum", "Suggested order"],
      rows.map((r) => [r.name, r.strength, r.unit, r.status === "OUT" ? "Out of stock" : "Low", r.onHand, r.expiredQty, r.minLevel, r.reorderLevel, r.maxLevel, r.suggested]),
    );
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="stocksafe-reorder-list.csv"' },
    });
  }
  return NextResponse.json({ rows });
});
