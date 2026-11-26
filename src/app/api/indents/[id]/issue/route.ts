import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/api";
import { db } from "@/lib/db";
import { issueIndent } from "@/lib/stock";
import { assertStoreAccess } from "@/lib/store-access";

// Issue an approved indent: FEFO transfer from the supplying store to the ward. SPEC section 7: STOREKEEPER.
export const POST = route(["STOREKEEPER"], async ({ user, params, ip }) => {
  const id = params.id ?? "";
  const ind = await db.indent.findUnique({ where: { id }, select: { toStoreId: true } });
  if (!ind) throw new ApiError(404, "NOT_FOUND", "Indent not found.");
  await assertStoreAccess(user, ind.toStoreId);
  return NextResponse.json(await issueIndent({ indentId: id, actorUserId: user.id, ip }));
});
