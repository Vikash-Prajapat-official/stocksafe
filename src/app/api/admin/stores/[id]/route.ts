import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ADMIN_ONLY } from "@/lib/rbac";
import { storePatchSchema } from "@/lib/schemas/admin";

export const PATCH = route(ADMIN_ONLY, async ({ req, user, params, ip }) => {
  const id = params.id ?? "";
  const data = await parseBody(req, storePatchSchema);
  const store = await db.$transaction(async (tx) => {
    const updated = await tx.store.update({ where: { id }, data }); // P2025 -> 404
    await writeAudit(tx, { actorUserId: user.id, action: "STORE_UPDATE", entity: "store", entityId: id, ip });
    return updated;
  });
  return NextResponse.json({ store });
});
