import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { getStockRows } from "@/lib/ledger";

// Stock on hand for one item, by store and batch (earliest expiry first). Any signed-in user.
export const GET = route("ANY", async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const itemId = sp.get("itemId");
  if (!itemId) throw new ApiError(400, "VALIDATION", "itemId: required");
  const rows = await getStockRows({ itemId, storeId: sp.get("storeId") ?? undefined });
  return NextResponse.json({ rows });
});
