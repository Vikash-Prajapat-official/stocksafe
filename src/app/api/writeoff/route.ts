import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { ADMIN_ONLY } from "@/lib/rbac";
import { writeoffSchema } from "@/lib/schemas/stock";
import { writeOff } from "@/lib/stock";

// Write off an expired batch. SPEC section 7: ADMIN approves. The admin doing it is the approver.
export const POST = route(ADMIN_ONLY, async ({ req, user, ip }) => {
  const body = await parseBody(req, writeoffSchema);
  const result = await writeOff({ ...body, actorUserId: user.id, approvedBy: user.id, ip });
  return NextResponse.json(result, { status: 201 });
});
