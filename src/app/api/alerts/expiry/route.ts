import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { getExpiryList } from "@/lib/alerts";
import { summarizeBands } from "@/lib/expiry-bands";

// Expired and near-expiry stock with rupee value. ?days=90 limits how far ahead, ?store=<id> one store.
export const GET = route("ANY", async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const daysParam = sp.get("days");
  if (daysParam !== null && !/^\d{1,3}$/.test(daysParam)) throw new ApiError(400, "VALIDATION", "days: must be a number from 0 to 999");
  const r = await getExpiryList({ storeId: sp.get("store") ?? undefined });
  const rows = daysParam === null ? r.rows : r.rows.filter((x) => x.daysLeft <= Number(daysParam));
  return NextResponse.json({ today: r.today, bands: r.bands, summary: summarizeBands(rows, r.bands), rows, truncated: r.truncated });
});
