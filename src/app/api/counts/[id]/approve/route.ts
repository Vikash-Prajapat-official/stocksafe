import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { ADMIN_ONLY } from "@/lib/rbac";
import { applyCount } from "@/lib/stock";

// Approve a submitted count: writes the ADJUSTMENT movements. SPEC section 3 and 7: ADMIN approval.
export const POST = route(ADMIN_ONLY, async ({ user, params, ip }) => {
  return NextResponse.json(await applyCount({ countId: params.id ?? "", approverId: user.id, ip }));
});
