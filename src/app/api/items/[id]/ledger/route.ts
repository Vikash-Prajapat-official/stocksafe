import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getLedger } from "@/lib/ledger";

const int = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

// Bin card for an item with a running balance per store and batch. Any signed-in user (SPEC section 7).
export const GET = route("ANY", async ({ req, params }) => {
  const sp = new URL(req.url).searchParams;
  const result = await getLedger({
    itemId: params.id ?? "",
    storeId: sp.get("storeId") ?? undefined,
    batchId: sp.get("batchId") ?? undefined,
    limit: int(sp.get("limit")),
    offset: int(sp.get("offset")),
    order: sp.get("order") === "desc" ? "desc" : "asc",
  });
  return NextResponse.json(result);
});
