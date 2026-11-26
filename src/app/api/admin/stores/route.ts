import { NextResponse } from "next/server";
import { parseBody, route } from "@/lib/api";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ADMIN_ONLY } from "@/lib/rbac";
import { storeCreateSchema } from "@/lib/schemas/admin";

export const GET = route(ADMIN_ONLY, async () => {
  const stores = await db.store.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] });
  return NextResponse.json({ stores });
});

export const POST = route(ADMIN_ONLY, async ({ req, user, ip }) => {
  const data = await parseBody(req, storeCreateSchema);
  const store = await db.$transaction(async (tx) => {
    const created = await tx.store.create({ data });
    await writeAudit(tx, { actorUserId: user.id, action: "STORE_CREATE", entity: "store", entityId: created.id, ip });
    return created;
  });
  return NextResponse.json({ store }, { status: 201 });
});
