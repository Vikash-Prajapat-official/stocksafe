import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { ADMIN_ONLY } from "@/lib/rbac";
import { returnSchema } from "@/lib/schemas/stock";
import { returnToSupplier } from "@/lib/stock";

// Return stock to the supplier. SPEC section 7: ADMIN approves. The admin doing it is the approver.
export const POST = route(ADMIN_ONLY, async ({ req, user, ip }) => {
  const body = await parseBody(req, returnSchema);
  const result = await returnToSupplier({ ...body, actorUserId: user.id, approvedBy: user.id, ip });
  return NextResponse.json(result, { status: 201 });
});
