import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { receive } from "@/lib/stock";
import { grnSchema } from "@/lib/schemas/stock";
import { assertStoreAccess } from "@/lib/store-access";

// Goods receipt. SPEC section 7: STOREKEEPER.
export const POST = route(["STOREKEEPER"], async ({ req, user, ip }) => {
  const body = await parseBody(req, grnSchema);
  await assertStoreAccess(user, body.storeId);
  const result = await receive({ ...body, actorUserId: user.id, ip });
  return NextResponse.json(result, { status: 201 });
});
